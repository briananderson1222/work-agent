import { describe, expect, test, vi } from 'vitest';
import {
  createRuntimeFrameworkModel,
  resolveConfiguredModelId,
  resolveRuntimeEmbeddingProvider,
  resolveRuntimeVectorDbProvider,
} from '../runtime-provider-resolution.js';

describe('runtime-provider-resolution', () => {
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
    });

    expect(framework.createModel).toHaveBeenCalledWith(spec, {
      appConfig: { defaultModel: 'foo' },
      projectHomeDir: '/tmp/project',
      modelCatalog: { kind: 'catalog' },
    });
    expect(model).toEqual({ kind: 'model' });
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
