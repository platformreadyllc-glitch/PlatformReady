import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  forwardRef,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, WebSocket } from 'ws';
import { PlatformService } from './platform.service';
import { Role, Button, Transport } from './models/enums';
import { PlatformClockSerialized } from './models/platform-clock';

type LiveSocket = WebSocket & { isAlive?: boolean };

const ESP_WS_PATH = '/esp32-ws';

function parseTransport(raw: string | null): Transport {
  return raw === 'wifi' || raw === 'ethernet' ? raw : null;
}

// How often each connection is pinged, and therefore roughly how long a
// power-cycled remote's connected status takes to flip back to false (worst
// case: just under two intervals, since a ping sent right before power loss
// gets one full interval to time out before the next ping finds it silent).
const HEARTBEAT_INTERVAL_MS = 2000;

// Pushes assignment/vote updates to ESP32 remotes over a raw `ws` server
// sharing the HTTP server Nest already runs. Runs in noServer mode with a
// manual `upgrade` handler that ONLY claims requests for ESP_WS_PATH and
// leaves everything else untouched for the socket.io adapter's own upgrade
// handler - the `ws` `{ server, path }` option does NOT do this (its
// upgrade listener aborts every non-matching upgrade, which silently
// breaks socket.io's websocket transport). A plain provider rather than a
// second @WebSocketGateway because Nest binds one adapter app-wide.
@Injectable()
export class EspRemotesGateway
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private wss!: WebSocketServer;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private upgradeHandler?: (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void;
  // remoteId -> its one live connection. A reconnect replaces the entry
  // and terminates the superseded socket (see the connection handler) - a
  // half-open old socket isn't in this map, so the heartbeat sweep can't
  // reap it.
  private readonly connections = new Map<string, LiveSocket>();

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    @Inject(forwardRef(() => PlatformService))
    private readonly platformService: PlatformService,
  ) {}

  onApplicationBootstrap(): void {
    const httpServer = this.httpAdapterHost.httpAdapter.getHttpServer();
    this.wss = new WebSocketServer({ noServer: true });

    this.upgradeHandler = (req, socket, head) => {
      const { pathname } = new URL(req.url ?? '', 'http://esp32-ws.local');
      if (pathname !== ESP_WS_PATH) return; // not ours - leave it for socket.io
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req);
      });
    };
    httpServer.on('upgrade', this.upgradeHandler);

    this.wss.on('connection', (ws: LiveSocket, req: IncomingMessage) => {
      const url = new URL(req.url ?? '', 'http://esp32-ws.local');
      const remoteId = url.searchParams.get('remoteId');
      const transport = parseTransport(url.searchParams.get('transport'));

      if (!remoteId || !this.platformService.findRemote(remoteId)) {
        ws.close(4000, 'unknown remote');
        return;
      }

      // A reconnect that beats the server noticing the old TCP connection
      // died would otherwise leak that half-open socket until OS keepalive
      // reaps it (hours). Terminate it now; its `close` handler no-ops
      // because the map no longer points at it.
      const superseded = this.connections.get(remoteId);
      if (superseded && superseded !== ws) superseded.terminate();

      this.connections.set(remoteId, ws);
      this.platformService.markRemoteConnected(remoteId, transport);

      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Without this, a malformed frame (a buggy/corrupted client - this
      // is exactly how a real firmware bug surfaced: a bad Ethernet-path
      // write() elsewhere corrupted the frame stream and the `ws` package
      // threw "Invalid WebSocket frame: RSV1 must be clear") is an
      // unhandled 'error' event, which crashes the entire backend process
      // - wiping all in-memory state for every remote/platform, not just
      // this one connection. Log and drop just this connection instead.
      ws.on('error', (err) => {
        console.error(`[esp-remotes] WS error for ${remoteId}:`, err);
        ws.terminate();
      });

      ws.on('close', () => {
        // Only clear state if this socket is still the one on record - a
        // superseded old socket closing shouldn't stomp on a newer
        // reconnect's state.
        if (this.connections.get(remoteId) === ws) {
          this.connections.delete(remoteId);
          this.platformService.markRemoteDisconnected(remoteId);
        }
      });
    });

    this.heartbeatTimer = setInterval(() => {
      for (const ws of this.connections.values()) {
        if (ws.isAlive === false) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.upgradeHandler) {
      this.httpAdapterHost.httpAdapter
        .getHttpServer()
        .off('upgrade', this.upgradeHandler);
    }
    this.wss?.close();
  }

  // Called by PlatformService when this remote's own assignment changes.
  pushAssignment(
    remoteId: string,
    platformId: string | null,
    role: Role | null,
  ): void {
    this.sendFrame(
      remoteId,
      JSON.stringify({ type: 'assignment', platformId, role }),
    );
  }

  // Called by PlatformService whenever a platform's votes or clock change -
  // in practice, on every action (vote/clock press/reset/break/etc.) and
  // once a second while a clock is running, mirroring the cadence the
  // browser-facing PlatformGateway already gets via the same call site.
  broadcastPlatformState(
    activeRemoteIds: Iterable<string>,
    votes: Record<string, Button | null>,
    clock: PlatformClockSerialized,
  ): void {
    const frame = JSON.stringify({ type: 'state', votes, clock });
    for (const remoteId of activeRemoteIds) this.sendFrame(remoteId, frame);
  }

  private sendFrame(remoteId: string, frame: string): void {
    const ws = this.connections.get(remoteId);
    if (ws && ws.readyState === ws.OPEN) ws.send(frame);
  }
}
