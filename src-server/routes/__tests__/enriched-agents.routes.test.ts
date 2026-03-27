import { describe, expect, test, vi } from 'vitest';

const { createEnrichedAgentRoutes } = await import('../enriched-agents.js');

function setup(overrides: Record<string, unknown> = {}) {
  const metadata = new Map([
    ['default', { name: 'Default', description: 'Default agent', updatedAt: '2026-01-01' }],
    ['custom', { name: 'Custom', description: 'Custom agent', updatedAt: '2026-01-02' }],
  ]);
  const deps = {
    agentMetadataMap: metadata,
    activeAgents: new Map([['default', {}], ['custom', {}]]),
    loadAgent: vi.fn().mockResolvedValue({
      name: 'custom',
      prompt: 'test prompt',
      description: 'Custom agent',
      model: 'claude-3',
      region: 'us-east-1',
      maxSteps: 10,
      icon: '🤖',
      commands: [],
      tools: { mcpServers: ['fs'], autoApprove: [] },
      skills: [],
      guardrails: undefined,
    }),
    defaultModel: 'claude-3-sonnet',
    defaultTools: { mcpServers: [], autoApprove: [] },
    getVirtualAgents: vi.fn().mockReturnValue([]),
    isACPConnected: vi.fn().mockReturnValue(false),
    reloadAgents: vi.fn().mockResolvedValue(undefined),
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    ...overrides,
  };
  return { app: createEnrichedAgentRoutes(deps as any), deps };
}

async function json(res: Response) {
  return res.json();
}

describe('Enriched Agent Routes', () => {
  test('GET / returns agents with fields the UI reads', async () => {
    const { app } = setup();
    const body = await json(await app.request('/'));
    expect(body.success).toBe(true);
    const agent = body.data.find((a: any) => a.slug === 'custom');
    expect(agent).toBeDefined();
    // Fields the AgentsView and SDK useAgentsQuery depend on
    expect(agent).toMatchObject({
      slug: 'custom',
      name: 'Custom',
      prompt: 'test prompt',
      model: 'claude-3',
      toolsConfig: { mcpServers: ['fs'], autoApprove: [] },
      updatedAt: '2026-01-02',
    });
  });

  test('GET / includes ACP virtual agents when connected', async () => {
    const virtual = [{ slug: 'virtual', name: 'Virtual' }];
    const { app } = setup({
      isACPConnected: vi.fn().mockReturnValue(true),
      getVirtualAgents: vi.fn().mockReturnValue(virtual),
    });
    const body = await json(await app.request('/'));
    expect(body.data.some((a: any) => a.slug === 'virtual')).toBe(true);
  });

  test('GET / returns 500 on error', async () => {
    const { app } = setup({
      reloadAgents: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const res = await app.request('/');
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  test('GET /:slug returns single agent with full spec', async () => {
    const { app } = setup();
    const body = await json(await app.request('/custom'));
    expect(body.success).toBe(true);
    expect(body.data.slug).toBe('custom');
    expect(body.data.prompt).toBe('test prompt');
    expect(body.data.model).toBe('claude-3');
  });

  test('GET /:slug returns 404 for unknown agent', async () => {
    const { app } = setup();
    const res = await app.request('/nonexistent');
    expect(res.status).toBe(404);
  });

  test('GET /:slug returns 500 when loadAgent fails', async () => {
    const { app } = setup({
      loadAgent: vi.fn().mockRejectedValue(new Error('load failed')),
    });
    const res = await app.request('/custom');
    expect(res.status).toBe(500);
  });
});
