import { type WebSocket, WebSocketServer } from 'ws';
import type { TerminalEvent } from '../domain/terminal-types.js';
import type { TerminalService } from './terminal-service.js';

export class TerminalWebSocketServer {
  private wss: WebSocketServer | null = null;
  private unsubscribe: (() => void) | null = null;
  private clients = new Set<WebSocket>();
  private clientSessions = new Map<WebSocket, Set<string>>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private terminalService: TerminalService) {}

  start(port: number): void {
    this.wss = new WebSocketServer({ port });

    this.unsubscribe = this.terminalService.subscribe(
      (event: TerminalEvent) => {
        const msg = JSON.stringify(event);
        for (const client of this.clients) {
          if (client.readyState === client.OPEN) {
            client.send(msg);
          }
        }
      },
    );

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);

      ws.on('message', async (raw) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw.toString());
        } catch (e) {
          console.debug('Failed to parse WebSocket message:', e);
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
          return;
        }

        try {
          switch (msg.type) {
            case 'open': {
              const snapshot = await this.terminalService.open({
                ...(msg as unknown as Parameters<typeof this.terminalService.open>[0]),
                shell: msg.shell as string | undefined,
                shellArgs: msg.shellArgs as string[] | undefined,
              });
              ws.send(JSON.stringify({ type: 'snapshot', ...snapshot }));
              // Track session ownership
              const sid = snapshot.sessionId;
              if (!this.clientSessions.has(ws)) this.clientSessions.set(ws, new Set());
              this.clientSessions.get(ws)!.add(sid);
              // Cancel idle timer if client reconnected
              const timer = this.idleTimers.get(sid);
              if (timer) { clearTimeout(timer); this.idleTimers.delete(sid); }
              break;
            }
            case 'data':
              await this.terminalService.write(
                msg.sessionId as string,
                msg.data as string,
              );
              break;
            case 'resize':
              await this.terminalService.resize(
                msg.sessionId as string,
                msg.cols as number,
                msg.rows as number,
              );
              break;
            case 'close':
              await this.terminalService.close(msg.sessionId as string);
              break;
            default:
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message: `Unknown message type: ${msg.type}`,
                }),
              );
          }
        } catch (err) {
          console.error('[TerminalWebSocketServer] handler error:', err);
          ws.send(
            JSON.stringify({
              type: 'error',
              message: (err as Error).message ?? 'Internal error',
            }),
          );
        }
      });

      ws.on('close', () => {
        const sessions = this.clientSessions.get(ws);
        this.clientSessions.delete(ws);
        this.clients.delete(ws);
        if (sessions) {
          for (const sid of sessions) {
            // Check if any other client owns this session
            let owned = false;
            for (const [, s] of this.clientSessions) {
              if (s.has(sid)) { owned = true; break; }
            }
            if (!owned) {
              this.idleTimers.set(sid, setTimeout(() => {
                this.idleTimers.delete(sid);
                this.terminalService.close(sid);
              }, 60_000));
            }
          }
        }
      });
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const t of this.idleTimers.values()) clearTimeout(t);
    this.idleTimers.clear();
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    this.clientSessions.clear();
    this.wss?.close();
    this.wss = null;
  }
}
