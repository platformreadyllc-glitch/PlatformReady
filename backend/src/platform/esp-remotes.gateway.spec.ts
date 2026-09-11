import { EventEmitter } from 'events';
import { EspRemotesGateway } from './esp-remotes.gateway';
import { PlatformService } from './platform.service';

interface FakeWs {
  readyState: number;
  OPEN: number;
  isAlive?: boolean;
  close: jest.Mock;
  terminate: jest.Mock;
  ping: jest.Mock;
  send: jest.Mock;
  on: jest.Mock;
  fire: (event: string) => void;
}

function makeFakeWs(): FakeWs {
  const handlers: Record<string, () => void> = {};
  return {
    readyState: 1,
    OPEN: 1,
    close: jest.fn(),
    terminate: jest.fn(),
    ping: jest.fn(),
    send: jest.fn(),
    on: jest.fn((event: string, cb: () => void) => {
      handlers[event] = cb;
    }),
    fire: (event: string) => handlers[event]?.(),
  };
}

function makeService(): jest.Mocked<
  Pick<
    PlatformService,
    'findRemote' | 'markRemoteConnected' | 'markRemoteDisconnected'
  >
> {
  return {
    findRemote: jest.fn().mockReturnValue({ remoteId: 'x' }),
    markRemoteConnected: jest.fn(),
    markRemoteDisconnected: jest.fn(),
  } as never;
}

const booted: EspRemotesGateway[] = [];

function boot(service = makeService()) {
  const httpServer = new EventEmitter();
  const host = {
    httpAdapter: { getHttpServer: () => httpServer },
  };
  const gw = new EspRemotesGateway(host as never, service as never);
  gw.onApplicationBootstrap();
  booted.push(gw);
  const wss = (gw as unknown as { wss: EventEmitter }).wss;
  const connections = (gw as unknown as { connections: Map<string, FakeWs> })
    .connections;
  return { gw, service, httpServer, wss, connections };
}

const req = (query = '?remoteId=r1') => ({ url: `/esp32-ws${query}` });

afterEach(() => {
  for (const gw of booted.splice(0)) gw.onModuleDestroy();
  jest.useRealTimers();
});

describe('EspRemotesGateway connection handling', () => {
  it('rejects an unknown remoteId and does not track it', () => {
    const { wss, service, connections } = boot();
    service.findRemote.mockReturnValueOnce(undefined);
    const ws = makeFakeWs();

    wss.emit('connection', ws, req('?remoteId=nope'));

    expect(ws.close).toHaveBeenCalledWith(4000, 'unknown remote');
    expect(connections.size).toBe(0);
    expect(service.markRemoteConnected).not.toHaveBeenCalled();
  });

  it('rejects a connection with no remoteId', () => {
    const { wss } = boot();
    const ws = makeFakeWs();
    wss.emit('connection', ws, req(''));
    expect(ws.close).toHaveBeenCalledWith(4000, 'unknown remote');
  });

  it('tracks a valid connection and marks it connected', () => {
    const { wss, service, connections } = boot();
    const ws = makeFakeWs();

    wss.emit('connection', ws, req('?remoteId=r1'));

    expect(service.markRemoteConnected).toHaveBeenCalledWith('r1', null);
    expect(connections.get('r1')).toBe(ws);
  });

  it.each([
    ['wifi', 'wifi'],
    ['ethernet', 'ethernet'],
    ['bogus', null],
  ] as const)('parses ?transport=%s as %s', (raw, expected) => {
    const { wss, service } = boot();
    const ws = makeFakeWs();

    wss.emit('connection', ws, req(`?remoteId=r1&transport=${raw}`));

    expect(service.markRemoteConnected).toHaveBeenCalledWith('r1', expected);
  });

  it('terminates the superseded socket on reconnect', () => {
    const { wss, connections } = boot();
    const oldWs = makeFakeWs();
    const newWs = makeFakeWs();

    wss.emit('connection', oldWs, req('?remoteId=r1'));
    wss.emit('connection', newWs, req('?remoteId=r1'));

    expect(oldWs.terminate).toHaveBeenCalledTimes(1);
    expect(connections.get('r1')).toBe(newWs);
  });

  it('a superseded socket closing does not mark the remote disconnected', () => {
    const { wss, service } = boot();
    const oldWs = makeFakeWs();
    const newWs = makeFakeWs();
    wss.emit('connection', oldWs, req('?remoteId=r1'));
    wss.emit('connection', newWs, req('?remoteId=r1'));
    service.markRemoteDisconnected.mockClear();

    oldWs.fire('close');

    expect(service.markRemoteDisconnected).not.toHaveBeenCalled();
  });

  it('the current socket closing marks the remote disconnected and untracks it', () => {
    const { wss, service, connections } = boot();
    const ws = makeFakeWs();
    wss.emit('connection', ws, req('?remoteId=r1'));

    ws.fire('close');

    expect(service.markRemoteDisconnected).toHaveBeenCalledWith('r1');
    expect(connections.size).toBe(0);
  });

  it('a pong marks the socket alive again', () => {
    const { wss } = boot();
    const ws = makeFakeWs();
    wss.emit('connection', ws, req('?remoteId=r1'));
    ws.isAlive = false;

    ws.fire('pong');

    expect(ws.isAlive).toBe(true);
  });
});

describe('EspRemotesGateway heartbeat', () => {
  it('pings a live socket and terminates one that missed the last ping', () => {
    jest.useFakeTimers();
    const { wss } = boot();
    const ws = makeFakeWs();
    wss.emit('connection', ws, req('?remoteId=r1'));

    // First sweep: was alive -> gets pinged, flagged not-alive.
    jest.advanceTimersByTime(2000);
    expect(ws.ping).toHaveBeenCalledTimes(1);
    expect(ws.isAlive).toBe(false);

    // Second sweep with no pong in between -> terminated.
    jest.advanceTimersByTime(2000);
    expect(ws.terminate).toHaveBeenCalledTimes(1);
  });
});

describe('EspRemotesGateway upgrade routing', () => {
  it('only claims /esp32-ws upgrades, leaving others for socket.io', () => {
    const { gw, httpServer } = boot();
    const wss = (gw as unknown as { wss: { handleUpgrade: jest.Mock } }).wss;
    wss.handleUpgrade = jest.fn();
    const socket = { destroy: jest.fn() };

    httpServer.emit(
      'upgrade',
      { url: '/socket.io/?EIO=4&transport=websocket' },
      socket,
      Buffer.alloc(0),
    );
    expect(wss.handleUpgrade).not.toHaveBeenCalled();
    expect(socket.destroy).not.toHaveBeenCalled();

    httpServer.emit(
      'upgrade',
      { url: '/esp32-ws?remoteId=r1' },
      socket,
      Buffer.alloc(0),
    );
    expect(wss.handleUpgrade).toHaveBeenCalledTimes(1);
  });
});

describe('EspRemotesGateway broadcast', () => {
  it('sends one serialized frame to each open connection, skipping closed ones', () => {
    const { gw, wss } = boot();
    const open = makeFakeWs();
    const closed = makeFakeWs();
    closed.readyState = 3;
    wss.emit('connection', open, req('?remoteId=r1'));
    wss.emit('connection', closed, req('?remoteId=r2'));

    gw.broadcastPlatformState(['r1', 'r2'], { left: 'white' }, {
      mode: 'ACTIVE',
    } as never);

    expect(open.send).toHaveBeenCalledTimes(1);
    expect(closed.send).not.toHaveBeenCalled();
    const frame = JSON.parse(open.send.mock.calls[0][0] as string);
    expect(frame).toMatchObject({
      type: 'state',
      votes: { left: 'white' },
      clock: { mode: 'ACTIVE' },
    });
  });

  it('serializes the state frame once regardless of remote count', () => {
    const { gw, wss } = boot();
    const a = makeFakeWs();
    const b = makeFakeWs();
    wss.emit('connection', a, req('?remoteId=r1'));
    wss.emit('connection', b, req('?remoteId=r2'));

    gw.broadcastPlatformState(['r1', 'r2'], {}, { mode: 'ACTIVE' } as never);

    // Same string instance handed to both sockets.
    expect(a.send.mock.calls[0][0]).toBe(b.send.mock.calls[0][0]);
  });
});
