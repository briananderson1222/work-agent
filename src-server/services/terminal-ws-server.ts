import { WebSocketServer, type WebSocket } from 'ws';
import type { TerminalEvent } from '../domain/terminal-types.js';
import type { TerminalService } from './terminal-service.js';

export class TerminalWebSocketServer {
  private wss: WebSocketServer | null = null;
  private unsubscribe: (() => void) | null = null;
  private clients = new Set<WebSocket>();

  constructor(private terminalService: TerminalService) {}

  start(port: number): void {
    this.wss = new WebSocketServer({ port });

    this.unsubscribe = this.terminalService.subscribe((event: TerminalEvent) => {
      const msg = JSON.stringify(event);
      for (const client of this.clients) {
        if (client.readyState === client.OPEN) {
          client.send(msg);
        }
      }
    });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);

      ws.on('message', async (raw) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
          return;
        }

        try {
          switch (msg.type) {
            case 'open': {
              const snapshot = await this.terminalService.open(msg as never);
              ws.send(JSON.stringify({ type: 'snapshot', ...snapshot }));
              break;
            }
            case 'data':
              await this.terminalService.write(msg.sessionId as string, msg.data as string);
              break;
            case 'resize':
              await this.terminalService.resize(msg.sessionId as string, msg.cols as number, msg.rows as number);
              break;
            case 'close':
              await this.terminalService.close(msg.sessionId as string);
              break;
            default:
              ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
          }
        } catch (err) {
          console.error('[TerminalWebSocketServer] handler error:', err);
          ws.send(JSON.stringify({ type: 'error', message: (err as Error).message ?? 'Internal error' }));
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    this.wss?.close();
    this.wss = null;
  }
}
