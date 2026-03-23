import { describe, expect, test, vi } from 'vitest';

vi.mock('../telemetry/metrics.js', () => ({
  agentOps: { add: vi.fn() },
}));

const { AgentService } = await import('../agent-service.js');

function createMockConfigLoader() {
  return {
    listAgents: vi.fn().mockResolvedValue([{ slug: 'default', name: 'Default' }]),
    loadAgent: vi.fn().mockResolvedValue({ name: 'Default', prompt: 'You are helpful', slug: 'default' }),
    createAgent: vi.fn().mockResolvedValue({ slug: 'new-agent', spec: { name: 'New', prompt: 'test' } }),
    updateAgent: vi.fn().mockImplementation((_slug: string, updates: any) => Promise.resolve({ name: 'Default', ...updates })),
    deleteAgent: vi.fn().mockResolvedValue(undefined),
    getLayoutsUsingAgent: vi.fn().mockResolvedValue([]),
  };
}

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

describe('AgentService', () => {
  test('listAgents delegates to configLoader', async () => {
    const loader = createMockConfigLoader();
    const svc = new AgentService(loader as any, new Map(), new Map(), new Map(), mockLogger);
    const result = await svc.listAgents();
    expect(result).toEqual([{ slug: 'default', name: 'Default' }]);
  });

  test('createAgent delegates and returns slug+spec', async () => {
    const loader = createMockConfigLoader();
    const svc = new AgentService(loader as any, new Map(), new Map(), new Map(), mockLogger);
    const result = await svc.createAgent({ name: 'New', prompt: 'test' });
    expect(result.slug).toBe('new-agent');
  });

  test('deleteAgent fails if layouts reference agent', async () => {
    const loader = createMockConfigLoader();
    loader.getLayoutsUsingAgent.mockResolvedValue(['dashboard']);
    const svc = new AgentService(loader as any, new Map(), new Map(), new Map(), mockLogger);
    const result = await svc.deleteAgent('default');
    expect(result.success).toBe(false);
    expect(result.error).toContain('dashboard');
  });

  test('deleteAgent succeeds when no layouts reference agent', async () => {
    const loader = createMockConfigLoader();
    const svc = new AgentService(loader as any, new Map(), new Map(), new Map(), mockLogger);
    const result = await svc.deleteAgent('default');
    expect(result.success).toBe(true);
  });

  test('deleteAgent removes from activeAgents map', async () => {
    const loader = createMockConfigLoader();
    const active = new Map([['default', { id: 'default' }]]);
    const svc = new AgentService(loader as any, active, new Map(), new Map(), mockLogger);
    await svc.deleteAgent('default');
    expect(active.has('default')).toBe(false);
  });

  test('isAgentActive checks activeAgents map', () => {
    const active = new Map([['default', {}]]);
    const svc = new AgentService({} as any, active, new Map(), new Map(), mockLogger);
    expect(svc.isAgentActive('default')).toBe(true);
    expect(svc.isAgentActive('missing')).toBe(false);
  });

  test('getActiveAgent returns from map', () => {
    const agent = { id: 'default' };
    const active = new Map([['default', agent]]);
    const svc = new AgentService({} as any, active, new Map(), new Map(), mockLogger);
    expect(svc.getActiveAgent('default')).toBe(agent);
    expect(svc.getActiveAgent('missing')).toBeUndefined();
  });

  test('loadAgentSpec delegates to configLoader', async () => {
    const loader = createMockConfigLoader();
    const svc = new AgentService(loader as any, new Map(), new Map(), new Map(), mockLogger);
    const spec = await svc.loadAgentSpec('default');
    expect(spec.name).toBe('Default');
    expect(loader.loadAgent).toHaveBeenCalledWith('default');
  });
});
