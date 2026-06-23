import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PlatformSerialized } from './models/platform';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' },
})
export class PlatformGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('join-platform')
  handleJoin(client: Socket, platformId: string): void {
    client.join(`platform:${platformId}`);
  }

  emitPlatformUpdate(platformId: string, data: PlatformSerialized): void {
    this.server.to(`platform:${platformId}`).emit('platform:updated', data);
  }

  emitGlobalUpdate(platforms: Record<string, PlatformSerialized>): void {
    for (const [id, data] of Object.entries(platforms)) {
      this.server.to(`platform:${id}`).emit('platform:updated', data);
    }
  }
}
