import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../providers/connection-factories.js', () => ({
  createLLMProvider: vi.fn(),
  createEmbeddingProvider: vi.fn(() => null),
  createVectorDbProvider: vi.fn((connection: any) =>
    connection.type === 'lancedb' ? { id: 'lancedb' } : null,
  ),
}));

const { createLLMProvider } = await import(
  '../../providers/connection-factories.js'
);
const {
  createRuntimeFrameworkModel,
  resolveConfiguredModelId,
  resolveManagedModelBinding,
  resolveRuntimeEmbeddingProvider,
  resolveRuntimeVectorDbProvider,
} = await import('../runtime-provider-resolution.js');

describe('runtime-provider-resolution', () => {
  beforeEach(() => {
    vi.mocked(createLLMProvider).mockReset();
  });

  test('createRuntimeFrameworkModel delegates to the active framework', async () => {
    const framework = {
      createModel: vi.fn(async () => ({ kind: 'model' })),
    };
    const spec = { slug: 'agent-1' } as any;

    const model = await createRuntimeFrameworkModel(spec, {
      framework: framework as any,
      appConfig: { defaultModel: 'foo' } as any,
      projectHomeDir: '/tmp/project',
      modelCatalog: { kind: 'catalog' } as any,
      listProviderConnections: () => [],
    });

    expect(framework.createModel).toHaveBeenCalledWith(spec, {
      appConfig: { defaultModel: 'foo' },
      projectHomeDir: '/tmp/project',
      modelCatalog: { kind: 'catalog' },
      listProviderConnections: expect.any(Function),
    });
    expect(model).toEqual({ kind: 'model' });
  });

  test('prefers explicit managed model connections and provider-specific model defaults', async () => {
    vi.mocked(createLLMProvider).mockReturnValue({
      listModels: vi.fn(async () => [
        { id: 'gpt-4.1', name: 'GPT-4.1' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      ]),
    } as any);

    const binding = await resolveManagedModelBinding(
      {
        execution: {
          modelConnectionId: 'openai-main',
        },
      } as any,
      {
        appConfig: {
          defaultLLMProvider: 'bedrock-default',
          defaultModel: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
        } as any,
        listProviderConnections: () =>
          [
            {
              id: 'bedrock-default',
              type: 'bedrock',
              enabled: true,
              capabilities: ['llm'],
              config: {
                defaultModel: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
              },
            },
            {
              id: 'openai-main',
              type: 'openai-compat',
              enabled: true,
              capabilities: ['llm'],
              config: { defaultModel: 'gpt-4.1' },
            },
          ] as any,
      },
    );

    expect(binding.providerConnection?.id).toBe('openai-main');
    expect(binding.providerType).toBe('openai-compat');
    expect(binding.modelId).toBe('gpt-4.1');
  });

  test('falls back to the first available provider model when the preferred model is unsupported', async () => {
    vi.mocked(createLLMProvider).mockReturnValue({
      listModels: vi.fn(async () => [{ id: 'llama3.2', name: 'Llama 3.2' }]),
    } as any);

    const binding = await resolveManagedModelBinding(
      {
        model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
        execution: {
          modelConnectionId: 'ollama-main',
        },
      } as any,
      {
        appConfig: {
          defaultModel: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
        } as any,
        listProviderConnections: () =>
          [
            {
              id: 'ollama-main',
              type: 'ollama',
              enabled: true,
              capabilities: ['llm'],
              config: {},
            },
          ] as any,
      },
    );

    expect(binding.providerConnection?.id).toBe('ollama-main');
    expect(binding.modelId).toBe('llama3.2');
  });

  test('uses the bedrock catalog when a bedrock connection is selected', async () => {
    const modelCatalog = {
      resolveModelId: vi.fn(async (modelId: string) => `resolved:${modelId}`),
    };

    const binding = await resolveManagedModelBinding(
      {
        execution: {
          modelConnectionId: 'bedrock-default',
        },
      } as any,
      {
        appConfig: {
          defaultModel: 'claude-sonnet-4-6',
        } as any,
        listProviderConnections: () =>
          [
            {
              id: 'bedrock-default',
              type: 'bedrock',
              enabled: true,
              capabilities: ['llm'],
              config: {},
            },
          ] as any,
        modelCatalog: modelCatalog as any,
      },
    );

    expect(binding.providerType).toBe('bedrock');
    expect(binding.modelId).toBe('resolved:claude-sonnet-4-6');
    expect(modelCatalog.resolveModelId).toHaveBeenCalledWith(
      'claude-sonnet-4-6',
    );
  });

  test('resolveRuntimeVectorDbProvider returns the enabled vectordb provider', () => {
    const provider = resolveRuntimeVectorDbProvider({
      listProviderConnections: () =>
        [
          { enabled: true, capabilities: ['llm'] },
          {
            enabled: true,
            capabilities: ['vectordb'],
            type: 'lancedb',
            config: {},
          },
        ] as any,
    } as any);

    expect(provider).toBeTruthy();
  });

  test('resolveRuntimeEmbeddingProvider skips disabled or missing providers', () => {
    const provider = resolveRuntimeEmbeddingProvider({
      listProviderConnections: () =>
        [{ enabled: false, capabilities: ['embedding'] }] as any,
    } as any);

    expect(provider).toBeNull();
  });

  test('resolveConfiguredModelId skips catalog lookup when no model is configured', async () => {
    const modelCatalog = {
      resolveModelId: vi.fn(async (modelId: string) => `resolved:${modelId}`),
    };

    await expect(
      resolveConfiguredModelId({ model: '' } as any, {
        appConfig: { defaultModel: '' } as any,
        modelCatalog: modelCatalog as any,
      }),
    ).resolves.toBe('');

    expect(modelCatalog.resolveModelId).not.toHaveBeenCalled();
  });

  test('resolveConfiguredModelId uses the catalog when a model is configured', async () => {
    const modelCatalog = {
      resolveModelId: vi.fn(async (modelId: string) => `resolved:${modelId}`),
    };

    await expect(
      resolveConfiguredModelId({ model: '' } as any, {
        appConfig: { defaultModel: 'anthropic.test' } as any,
        modelCatalog: modelCatalog as any,
      }),
    ).resolves.toBe('resolved:anthropic.test');

    expect(modelCatalog.resolveModelId).toHaveBeenCalledWith('anthropic.test');
  });
});
