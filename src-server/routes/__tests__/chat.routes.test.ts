import { describe, expect, test, vi } from 'vitest';

vi.mock('../chat-request-preparation.js', () => ({
  prepareChatRequest: vi.fn(async () => ({
    options: { model: 'gpt-5.4' },
    useAlternateProvider: false,
    resolvedProviderConn: null,
    injectContext: null,
    ragContext: null,
  })),
}));

const streamPrimaryAgentChat = vi.fn(() => ({}) as Response);
vi.mock('../chat-primary-stream.js', () => ({
  logDebugChatImages: vi.fn(),
  streamPrimaryAgentChat: (...args: any[]) => streamPrimaryAgentChat(...args),
}));

vi.mock('../chat-model-override.js', () => ({
  resolveChatAgentModelOverride: vi.fn(async ({ agent }: any) => ({ agent })),
}));

const { createChatRoutes } = await import('../chat.js');

async function json(res: Response) {
  return res.json();
}

describe('Chat Routes', () => {
  test('builds a temp runtime agent for __runtime slugs instead of 404ing', async () => {
    const createModel = vi.fn(async () => ({ id: 'runtime-model' }));
    const createTempAgent = vi.fn(async () => ({ id: 'temp-agent' }));

    const app = createChatRoutes({
      acpBridge: { hasAgent: () => false },
      storageAdapter: { getProject: vi.fn() },
      providerService: { listProviderConnections: vi.fn(() => []) },
      configLoader: {
        getProjectHomeDir: () => '/tmp/stallion-test-home',
      },
      appConfig: {
        systemPrompt: 'Global system prompt',
        defaultMaxTurns: 9,
      },
      replaceTemplateVariables: (text: string) => text,
      framework: { createModel, createTempAgent },
      modelCatalog: undefined,
      activeAgents: new Map(),
      logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
      agentSpecs: new Map(),
      memoryAdapters: new Map(),
    } as any);

    const response = await app.request('/__runtime%3Acodex-runtime/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'ping', options: { model: 'gpt-5.4' } }),
    });

    expect(response).toBeTruthy();
    expect(createModel).toHaveBeenCalledWith(
      expect.objectContaining({
        execution: {
          runtimeConnectionId: 'codex-runtime',
          modelId: 'gpt-5.4',
        },
      }),
      expect.objectContaining({
        appConfig: expect.objectContaining({
          systemPrompt: 'Global system prompt',
        }),
        projectHomeDir: '/tmp/stallion-test-home',
      }),
    );
    expect(createTempAgent).toHaveBeenCalledWith({
      name: '__runtime:codex-runtime',
      instructions: expect.any(Function),
      model: { id: 'runtime-model' },
      tools: [],
      maxSteps: 9,
    });
    expect(streamPrimaryAgentChat).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: '__runtime:codex-runtime',
        agent: { id: 'temp-agent' },
      }),
    );
  });

  test('still returns 404 for unknown non-runtime agents', async () => {
    const app = createChatRoutes({
      acpBridge: { hasAgent: () => false },
      storageAdapter: { getProject: vi.fn() },
      providerService: { listProviderConnections: vi.fn(() => []) },
      configLoader: {
        getProjectHomeDir: () => '/tmp/stallion-test-home',
      },
      appConfig: {},
      replaceTemplateVariables: (text: string) => text,
      framework: { createModel: vi.fn(), createTempAgent: vi.fn() },
      modelCatalog: undefined,
      activeAgents: new Map(),
      logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
      agentSpecs: new Map(),
      memoryAdapters: new Map(),
    } as any);

    const response = await app.request('/missing/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'ping', options: {} }),
    });

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({
      success: false,
      error: 'Agent not found',
    });
  });
});
