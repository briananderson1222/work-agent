import { Hono } from 'hono';
import { WebSocketServer } from 'ws';
import { voiceOps } from '../telemetry/metrics.js';
import { VoiceSessionService } from '../voice/voice-session.js';
import {
  getBody,
  param,
  validate,
  voiceSessionCreateSchema,
} from './schemas.js';

export function createVoiceRoutes(voiceService: VoiceSessionService): Hono {
  const app = new Hono();

  app.post('/sessions', validate(voiceSessionCreateSchema), async (c) => {
    const body = getBody(c);
    const agentSlug = body?.agentSlug;
    const sessionId = crypto.randomUUID();
    voiceOps.add(1, { op: 'session.create' });
    return c.json({
      success: true,
      data: { sessionId, agentSlug: agentSlug ?? 'stallion-voice' },
    });
  });

  app.delete('/sessions/:id', (c) => {
    voiceService.destroySession(param(c, 'id'));
    voiceOps.add(1, { op: 'session.destroy' });
    return c.json({ success: true });
  });

  app.get('/status', (c) => {
    voiceOps.add(1, { op: 'status' });
    return c.json({
      success: true,
      data: { activeSessions: voiceService.getActiveCount() },
    });
  });
  app.get('/agent', (c) =>
    c.json({
      success: true,
      data: {
        slug: 'stallion-voice',
        activeSessions: voiceService.getActiveCount(),
      },
    }),
  );

  return app;
}

export function attachVoiceWebSocket(
  port: number,
  voiceService: VoiceSessionService,
): void {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const agentSlug = url.searchParams.get('agent') ?? undefined;
    voiceService.createSession(ws, { agentSlug });
  });
}
