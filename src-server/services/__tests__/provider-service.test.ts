import { describe, expect, test, vi } from 'vitest';

vi.mock('../telemetry/metrics.js', () => ({
  providerOps: { add: vi.fn() },
}));

const { ProviderService } = await import('../provider-service.js');

function createMockStorageAdapter() {
  const connections: any[] = [];
  return {
    listProviderConnections: vi.fn(() => connections),
    saveProviderConnection: vi.fn((c: any) => connections.push(c)),
    deleteProviderConnection: vi.fn((id: string) => {
      const idx = connections.findIndex((c) => c.id === id);
      if (idx >= 0) connections.splice(idx, 1);
    }),
    getProject: vi.fn().mockResolvedValue({ defaultProviderId: 'bedrock', defaultModel: 'claude-3' }),
    listProjects: vi.fn(() => []),
  };
}

describe('ProviderService', () => {
  test('listProviderConnections delegates', () => {
    const adapter = createMockStorageAdapter();
    const svc = new ProviderService(adapter as any, async () => ({ defaultLLMProvider: 'bedrock', defaultModel: 'claude-3' }) as any);
    svc.listProviderConnections();
    expect(adapter.listProviderConnections).toHaveBeenCalled();
  });

  test('saveProviderConnection persists', () => {
    const adapter = createMockStorageAdapter();
    const svc = new ProviderService(adapter as any, async () => ({}) as any);
    svc.saveProviderConnection({ id: 'p1', type: 'bedrock' } as any);
    expect(adapter.saveProviderConnection).toHaveBeenCalledWith({ id: 'p1', type: 'bedrock' });
  });

  test('deleteProviderConnection removes', () => {
    const adapter = createMockStorageAdapter();
    const svc = new ProviderService(adapter as any, async () => ({}) as any);
    svc.deleteProviderConnection('p1');
    expect(adapter.deleteProviderConnection).toHaveBeenCalledWith('p1');
  });

  test('resolveProvider uses conversation-level override', async () => {
    const adapter = createMockStorageAdapter();
    const svc = new ProviderService(adapter as any, async () => ({}) as any);
    const result = await svc.resolveProvider({ conversationProviderId: 'openai', conversationModel: 'gpt-4' });
    expect(result).toEqual({ providerId: 'openai', model: 'gpt-4' });
  });

  test('resolveProvider falls back to project config', async () => {
    const adapter = createMockStorageAdapter();
    const svc = new ProviderService(adapter as any, async () => ({}) as any);
    const result = await svc.resolveProvider({ projectSlug: 'my-project' });
    expect(result).toEqual({ providerId: 'bedrock', model: 'claude-3' });
  });

  test('resolveProvider falls back to app config', async () => {
    const adapter = createMockStorageAdapter();
    adapter.getProject.mockRejectedValue(new Error('not found'));
    const svc = new ProviderService(adapter as any, async () => ({ defaultLLMProvider: 'anthropic', defaultModel: 'claude-3.5' }) as any);
    const result = await svc.resolveProvider({ projectSlug: 'missing' });
    expect(result).toEqual({ providerId: 'anthropic', model: 'claude-3.5' });
  });

  test('checkHealth returns provider health', async () => {
    const adapter = createMockStorageAdapter();
    const svc = new ProviderService(adapter as any, async () => ({}) as any);
    const provider = { healthCheck: vi.fn().mockResolvedValue(true) };
    expect(await svc.checkHealth(provider as any, 'test')).toBe(true);
  });
});
