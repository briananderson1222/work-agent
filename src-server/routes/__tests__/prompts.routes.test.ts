import { describe, expect, test, vi } from 'vitest';
import {
  getInternalApiToken,
  INTERNAL_API_TOKEN_HEADER,
} from '../../utils/internal-api-token.js';

vi.mock('../../telemetry/metrics.js', () => ({
  promptOps: { add: vi.fn() },
}));

const { createPromptRoutes } = await import('../prompts.js');

function createMockPromptService() {
  const prompts: any[] = [];
  return {
    listPrompts: vi.fn(async () => [...prompts]),
    getPrompt: vi.fn(
      async (id: string) => prompts.find((p) => p.id === id) ?? null,
    ),
    addPrompt: vi.fn(async (opts: any) => {
      const p = {
        id: `p-${prompts.length}`,
        source: 'local',
        provenance: {
          createdFrom: { kind: 'user' },
          updatedFrom: { kind: 'user' },
        },
        stats: {
          runs: 0,
          successes: 0,
          failures: 0,
          qualityScore: null,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...opts,
      };
      prompts.push(p);
      return p;
    }),
    updatePrompt: vi.fn(async (id: string, updates: any) => {
      const idx = prompts.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Prompt '${id}' not found`);
      prompts[idx] = { ...prompts[idx], ...updates };
      return prompts[idx];
    }),
    deletePrompt: vi.fn(async (id: string) => {
      const idx = prompts.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Prompt '${id}' not found`);
      prompts.splice(idx, 1);
    }),
    trackPromptRun: vi.fn(async (id: string) => {
      const idx = prompts.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Prompt '${id}' not found`);
      prompts[idx] = {
        ...prompts[idx],
        stats: {
          ...(prompts[idx].stats || {}),
          runs: (prompts[idx].stats?.runs || 0) + 1,
        },
      };
      return prompts[idx];
    }),
    recordPromptOutcome: vi.fn(async (id: string, outcome: string) => {
      const idx = prompts.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Prompt '${id}' not found`);
      const successes =
        (prompts[idx].stats?.successes || 0) + (outcome === 'success' ? 1 : 0);
      const failures =
        (prompts[idx].stats?.failures || 0) + (outcome === 'failure' ? 1 : 0);
      prompts[idx] = {
        ...prompts[idx],
        stats: {
          ...(prompts[idx].stats || {}),
          successes,
          failures,
          qualityScore:
            successes + failures > 0
              ? Math.round((successes / (successes + failures)) * 100)
              : null,
        },
      };
      return prompts[idx];
    }),
    listProviders: vi.fn(() => []),
  };
}

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

async function json(res: Response) {
  return res.json();
}

describe('Prompt Routes', () => {
  test('GET / returns empty list', async () => {
    const app = createPromptRoutes(
      createMockPromptService() as any,
      mockLogger,
    );
    const body = await json(await app.request('/'));
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test('POST / creates prompt', async () => {
    const svc = createMockPromptService();
    const app = createPromptRoutes(svc as any, mockLogger);
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', content: 'Do stuff' }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.data.name).toBe('Test');
  });

  test('POST / ignores hidden source context for public requests', async () => {
    const svc = createMockPromptService();
    const app = createPromptRoutes(svc as any, mockLogger);

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Agent Prompt',
        content: 'Refined content',
        _sourceContext: {
          kind: 'agent',
          agentSlug: 'planner',
          conversationId: 'conv-1',
        },
      }),
    });

    expect(res.status).toBe(201);
    expect(svc.addPrompt).toHaveBeenCalledWith(
      { name: 'Agent Prompt', content: 'Refined content' },
      undefined,
    );
  });

  test('POST / forwards hidden source context for trusted internal requests', async () => {
    const svc = createMockPromptService();
    const app = createPromptRoutes(svc as any, mockLogger);

    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [INTERNAL_API_TOKEN_HEADER]: getInternalApiToken(),
      },
      body: JSON.stringify({
        name: 'Agent Prompt',
        content: 'Refined content',
        _sourceContext: {
          kind: 'agent',
          agentSlug: 'planner',
          conversationId: 'conv-1',
        },
      }),
    });

    expect(res.status).toBe(201);
    expect(svc.addPrompt).toHaveBeenCalledWith(
      { name: 'Agent Prompt', content: 'Refined content' },
      {
        kind: 'agent',
        agentSlug: 'planner',
        conversationId: 'conv-1',
      },
    );
  });

  test('GET /:id returns 404 for missing', async () => {
    const app = createPromptRoutes(
      createMockPromptService() as any,
      mockLogger,
    );
    const res = await app.request('/nonexistent');
    expect(res.status).toBe(404);
  });

  test('DELETE /:id returns 500 for missing', async () => {
    const app = createPromptRoutes(
      createMockPromptService() as any,
      mockLogger,
    );
    const res = await app.request('/nonexistent', { method: 'DELETE' });
    expect(res.status).toBe(500);
  });

  test('GET /providers returns provider list', async () => {
    const app = createPromptRoutes(
      createMockPromptService() as any,
      mockLogger,
    );
    const body = await json(await app.request('/providers'));
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test('POST /:id/run records a playbook run', async () => {
    const svc = createMockPromptService();
    const created = await svc.addPrompt({ name: 'Tracked', content: 'x' });
    const app = createPromptRoutes(svc as any, mockLogger);

    const res = await app.request(`/${created.id}/run`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(svc.trackPromptRun).toHaveBeenCalledWith(created.id);
    const body = await json(res);
    expect(body.data.stats.runs).toBe(1);
  });

  test('POST /:id/outcome records playbook outcomes', async () => {
    const svc = createMockPromptService();
    const created = await svc.addPrompt({ name: 'Tracked', content: 'x' });
    const app = createPromptRoutes(svc as any, mockLogger);

    const res = await app.request(`/${created.id}/outcome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: 'success' }),
    });

    expect(res.status).toBe(200);
    expect(svc.recordPromptOutcome).toHaveBeenCalledWith(created.id, 'success');
    const body = await json(res);
    expect(body.data.stats.qualityScore).toBe(100);
  });

  test('POST /:id/convert-to-skill creates a local skill with asset provenance', async () => {
    const svc = createMockPromptService();
    const created = await svc.addPrompt({
      name: 'Research Plan',
      content: 'Draft the plan',
      description: 'Reusable research workflow',
      tags: ['research'],
      global: true,
    });
    const skillService = {
      listSkills: vi.fn(() => []),
      createLocalSkill: vi
        .fn()
        .mockResolvedValue({ success: true, message: 'Created' }),
    };
    const app = createPromptRoutes(svc as any, mockLogger, {
      skillService: skillService as any,
      getProjectHomeDir: () => '/home/test',
    });

    const res = await app.request(`/${created.id}/convert-to-skill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'research-skill' }),
    });

    expect(res.status).toBe(201);
    expect(skillService.createLocalSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'research-skill',
        body: 'Draft the plan',
        description: 'Reusable research workflow',
        tags: ['research'],
        global: true,
        provenance: {
          createdFrom: expect.objectContaining({
            kind: 'asset',
            action: 'playbook-to-skill',
            asset: expect.objectContaining({
              kind: 'playbook',
              id: created.id,
              name: 'Research Plan',
            }),
          }),
          updatedFrom: expect.objectContaining({
            kind: 'asset',
            action: 'playbook-to-skill',
          }),
        },
      }),
      '/home/test',
    );
  });

  test('POST /:id/convert-to-skill rejects duplicate skill names', async () => {
    const svc = createMockPromptService();
    const created = await svc.addPrompt({
      name: 'Research Plan',
      content: 'x',
    });
    const app = createPromptRoutes(svc as any, mockLogger, {
      skillService: {
        listSkills: vi.fn(() => [{ name: 'Research Plan' }]),
        createLocalSkill: vi.fn(),
      } as any,
      getProjectHomeDir: () => '/home/test',
    });

    const res = await app.request(`/${created.id}/convert-to-skill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(409);
  });
});
