import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../telemetry/metrics.js', () => ({
  providerOps: { add: vi.fn() },
}));
vi.mock('../../providers/connection-factories.js', () => ({
  createLLMProvider: vi.fn(),
}));

const { ProviderService } = await import('../provider-service.js');
const { createLLMProvider } = await import(
  '../../providers/connection-factories.js'
);

beforeEach(() => {
  vi.mocked(createLLMProvider).mockReset();
});

function createMockStorageAdapter() {
  const connections: any[] = [];
  return {
    listProviderConnections: vi.fn(() => connections),
    saveProviderConnection: vi.fn((c: any) => connections.push(c)),
    deleteProviderConnection: vi.fn((id: string) => {
      const idx = connections.findIndex((c) => c.id === id);
      if (idx >= 0) connections.splice(idx, 1);
    }),
    getProject: vi.fn().mockResolvedValue({
      defaultProviderId: 'bedrock',
      defaultModel: 'claude-3',
    }),
    listProjects: vi.fn(() => []),
  };
}

describe('ProviderService', () => {
  test('listProviderConnections delegates', () => {
    const adapter = createMockStorageAdapter();
    const svc = new ProviderService(
      adapter as any,
      async () =>
        ({ defaultLLMProvider: 'bedrock', defaultModel: 'claude-3' }) as any,
    );
    svc.listProviderConnections();
    expect(adapter.listProviderConnections).toHaveBeenCalled();
  });

  test('saveProviderConnection persists', () => {
    const adapter = createMockStorageAdapter();
    const svc = new ProviderService(adapter as any, async () => ({}) as any);
    svc.saveProviderConnection({ id: 'p1', type: 'bedrock' } as any);
    expect(adapter.saveProviderConnection).toHaveBeenCalledWith({
      id: 'p1',
      type: 'bedrock',
    });
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
    const result = await svc.resolveProvider({
      conversationProviderId: 'openai',
      conversationModel: 'gpt-4',
    });
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
    const svc = new ProviderService(
      adapter as any,
      async () =>
        ({
          defaultLLMProvider: 'anthropic',
          defaultModel: 'claude-3.5',
        }) as any,
    );
    const result = await svc.resolveProvider({ projectSlug: 'missing' });
    expect(result).toEqual({ providerId: 'anthropic', model: 'claude-3.5' });
  });

  test('resolveProvider falls back to the first enabled llm connection before a hard-coded provider', async () => {
    const adapter = createMockStorageAdapter();
    adapter.getProject.mockRejectedValue(new Error('not found'));
    adapter.saveProviderConnection({
      id: 'ollama-local',
      type: 'ollama',
      enabled: true,
      capabilities: ['llm'],
    });
    const svc = new ProviderService(
      adapter as any,
      async () =>
        ({
          defaultModel: 'llama3.2',
        }) as any,
    );
    vi.mocked(createLLMProvider).mockReturnValue({
      listModels: vi.fn(async () => [{ id: 'llama3.2', name: 'Llama 3.2' }]),
    } as any);

    const result = await svc.resolveProvider({ projectSlug: 'missing' });

    expect(result).toEqual({
      providerId: 'ollama-local',
      model: 'llama3.2',
    });
  });

  test('resolveProvider picks the first available provider model when the preferred model is unavailable', async () => {
    const adapter = createMockStorageAdapter();
    adapter.getProject.mockRejectedValue(new Error('not found'));
    adapter.saveProviderConnection({
      id: 'ollama-local',
      type: 'ollama',
      name: 'Ollama',
      enabled: true,
      capabilities: ['llm'],
      config: {},
    });
    const svc = new ProviderService(
      adapter as any,
      async () =>
        ({
          defaultModel: 'us.anthropic.claude-sonnet-4-6',
        }) as any,
    );
    vi.mocked(createLLMProvider).mockReturnValue({
      listModels: vi.fn(async () => [{ id: 'llama3.2', name: 'Llama 3.2' }]),
    } as any);

    const result = await svc.resolveProvider({ projectSlug: 'missing' });

    expect(result).toEqual({
      providerId: 'ollama-local',
      model: 'llama3.2',
    });
  });

  test('resolveProvider throws when a non-bedrock provider has no available models', async () => {
    const adapter = createMockStorageAdapter();
    adapter.getProject.mockRejectedValue(new Error('not found'));
    adapter.saveProviderConnection({
      id: 'ollama-local',
      type: 'ollama',
      name: 'Ollama',
      enabled: true,
      capabilities: ['llm'],
      config: {},
    });
    const svc = new ProviderService(
      adapter as any,
      async () =>
        ({
          defaultModel: 'us.anthropic.claude-sonnet-4-6',
        }) as any,
    );
    vi.mocked(createLLMProvider).mockReturnValue({
      listModels: vi.fn(async () => []),
    } as any);

    await expect(
      svc.resolveProvider({ projectSlug: 'missing' }),
    ).rejects.toThrow(/No models available/);
  });

  test('checkHealth returns provider health', async () => {
    const adapter = createMockStorageAdapter();
    const svc = new ProviderService(adapter as any, async () => ({}) as any);
    const provider = { healthCheck: vi.fn().mockResolvedValue(true) };
    expect(await svc.checkHealth(provider as any, 'test')).toBe(true);
  });
});
