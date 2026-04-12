import { describe, expect, test, vi } from 'vitest';
import {
  createRuntimeFrameworkModel,
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
});
