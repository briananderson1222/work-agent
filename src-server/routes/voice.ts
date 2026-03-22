import { Hono } from 'hono';
import { WebSocketServer } from 'ws';
import { VoiceSessionService } from '../voice/voice-session.js';
import { voiceOps } from '../telemetry/metrics.js';

export function createVoiceRoutes(voiceService: VoiceSessionService): Hono {
  const app = new Hono();

  app.post('/sessions', async (c) => {
    let agentSlug: string | undefined;
    try { const body = await c.req.json(); agentSlug = body?.agentSlug; } catch {}
    const sessionId = crypto.randomUUID();
    voiceOps.add(1, { op: 'session.create' });
    return c.json({ sessionId, agentSlug: agentSlug ?? 'stallion-voice' });
  });

  app.delete('/sessions/:id', (c) => {
    voiceService.destroySession(c.req.param('id'));
    voiceOps.add(1, { op: 'session.destroy' });
    return c.json({ ok: true });
  });

  app.get('/status', (c) => { voiceOps.add(1, { op: 'status' }); return c.json({ activeSessions: voiceService.getActiveCount() }); });
  app.get('/agent', (c) => c.json({ slug: 'stallion-voice', activeSessions: voiceService.getActiveCount() }));

  return app;
}

export function attachVoiceWebSocket(port: number, voiceService: VoiceSessionService): void {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const agentSlug = url.searchParams.get('agent') ?? undefined;
    voiceService.createSession(ws, { agentSlug });
  });
}
