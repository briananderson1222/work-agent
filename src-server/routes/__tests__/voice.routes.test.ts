import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  voiceOps: { add: vi.fn() },
}));

const { createVoiceRoutes } = await import('../voice.js');

async function json(res: Response) {
  return res.json();
}

function createMockVoiceService() {
  return {
    destroySession: vi.fn(),
    getActiveCount: vi.fn().mockReturnValue(2),
  };
}

describe('Voice Routes', () => {
  test('POST /sessions creates a voice session with explicit agent slug', async () => {
    const service = createMockVoiceService();
    const app = createVoiceRoutes(service as any);

    const body = await json(
      await app.request('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentSlug: 'voice-agent' }),
      }),
    );

    expect(body.success).toBe(true);
    expect(body.data.agentSlug).toBe('voice-agent');
    expect(body.data.sessionId).toBeTruthy();
  });

  test('DELETE /sessions/:id destroys a voice session', async () => {
    const service = createMockVoiceService();
    const app = createVoiceRoutes(service as any);

    const body = await json(
      await app.request('/sessions/demo', { method: 'DELETE' }),
    );

    expect(body).toEqual({ success: true });
    expect(service.destroySession).toHaveBeenCalledWith('demo');
  });

  test('GET /status and /agent return active session info', async () => {
    const service = createMockVoiceService();
    const app = createVoiceRoutes(service as any);

    const status = await json(await app.request('/status'));
    const agent = await json(await app.request('/agent'));

    expect(status).toEqual({
      success: true,
      data: { activeSessions: 2 },
    });
    expect(agent).toEqual({
      success: true,
      data: { slug: 'stallion-voice', activeSessions: 2 },
    });
  });
});
