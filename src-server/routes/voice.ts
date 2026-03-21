import { Hono } from 'hono';
import { WebSocketServer } from 'ws';
import type { Server } from 'http';
import { VoiceSessionService } from '../voice/voice-session.js';

export function createVoiceRoutes(voiceService: VoiceSessionService): Hono {
  const app = new Hono();

  // POST /api/voice/sessions — reserve a session ID; actual session starts on WS connect
  app.post('/sessions', (c) => {
    const sessionId = crypto.randomUUID();
    return c.json({ sessionId });
  });

  // DELETE /api/voice/sessions/:id — destroy a session
  app.delete('/sessions/:id', (c) => {
    voiceService.destroySession(c.req.param('id'));
    return c.json({ ok: true });
  });

  // GET /api/voice/status — active session count
  app.get('/status', (c) => {
    return c.json({ activeSessions: voiceService.getActiveCount() });
  });

  return app;
}

export function attachVoiceWebSocket(server: Server, voiceService: VoiceSessionService): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    if (!url.pathname.match(/^\/api\/voice\/ws\/.+$/)) return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      voiceService.createSession(ws, {});
    });
  });
}
