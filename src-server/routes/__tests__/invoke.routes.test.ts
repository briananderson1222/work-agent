import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  chatRequests: { add: vi.fn() },
}));

vi.mock('../../utils/auth-errors.js', () => ({
  isAuthError: () => false,
}));

vi.mock('ai', () => ({
  jsonSchema: (s: unknown) => s,
}));

vi.mock('../../services/cron.js', () => ({
  validateCron: () => false,
}));

const { createInvokeRoutes } = await import('../invoke.js');

function createMockCtx(overrides: Record<string, unknown> = {}) {
  const mockAgent = {
    generateText: vi.fn().mockResolvedValue({
      text: 'Hello from agent',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      steps: [{ type: 'text' }],
      toolCalls: [],
      toolResults: [],
      reasoning: null,
    }),
    generateObject: vi.fn().mockResolvedValue({
      object: { result: 'structured' },
      usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
    }),
    instructions: 'test instructions',
    model: 'test-model',
  };

  return {
    activeAgents: new Map([['default', mockAgent]]),
    agentTools: new Map([['default', [{ name: 'tool1' }]]]),
    globalToolRegistry: new Map(),
    modelCatalog: {
      resolveModelId: vi.fn().mockResolvedValue('resolved-model'),
    },
    createBedrockModel: vi.fn().mockResolvedValue('bedrock-model'),
    framework: {
      createTempAgent: vi.fn().mockResolvedValue(mockAgent),
    },
    appConfig: {
      invokeModel: 'default-model',
      structureModel: 'structure-model',
      systemPrompt: null,
    },
    replaceTemplateVariables: vi.fn((s: string) => s),
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    ...overrides,
  };
}

async function json(res: Response) {
  return res.json();
}

describe('Invoke Routes', () => {
  // SDK invokeAgent returns the full response object
  test('POST /agents/:slug/invoke returns { success, response, usage }', async () => {
    const ctx = createMockCtx();
    const app = createInvokeRoutes(ctx as any);
    const body = await json(
      await app.request('/agents/default/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'Hello' }),
      }),
    );
    expect(body.success).toBe(true);
    expect(body.response).toBe('Hello from agent');
    // SDK passes through usage, steps, toolCalls, toolResults, reasoning
    expect(body.usage).toEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
    expect(body.steps).toBeDefined();
    expect(body.toolCalls).toBeDefined();
    expect(body.toolResults).toBeDefined();
    expect(body).toHaveProperty('reasoning');
  });

  test('POST /agents/:slug/invoke returns 404 for unknown agent', async () => {
    const ctx = createMockCtx();
    const app = createInvokeRoutes(ctx as any);
    const res = await app.request('/agents/nonexistent/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'Hello' }),
    });
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.success).toBe(false);
  });

  test('POST /agents/:slug/invoke with schema parses JSON response', async () => {
    const ctx = createMockCtx();
    const agent = ctx.activeAgents.get('default')!;
    (agent.generateText as any).mockResolvedValue({
      text: '{"name":"test"}',
      usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
      steps: [],
      toolCalls: [],
      toolResults: [],
      reasoning: null,
    });
    const app = createInvokeRoutes(ctx as any);
    const body = await json(
      await app.request('/agents/default/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'Hello', schema: { type: 'object' } }),
      }),
    );
    expect(body.success).toBe(true);
    expect(body.response).toEqual({ name: 'test' });
  });

  // SDK invoke() expects { success, response } — returns data.response
  test('POST /invoke returns { success, response, usage, steps }', async () => {
    const ctx = createMockCtx();
    const app = createInvokeRoutes(ctx as any);
    const body = await json(
      await app.request('/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Do something' }),
      }),
    );
    expect(body.success).toBe(true);
    expect(body.response).toBe('Hello from agent');
    expect(body.usage).toBeDefined();
    expect(typeof body.steps).toBe('number');
  });

  test('POST /invoke returns 500 when no invoke model is configured and none is provided', async () => {
    const ctx = createMockCtx({
      appConfig: {
        invokeModel: '',
        structureModel: '',
        defaultModel: '',
        systemPrompt: null,
      },
    });
    const app = createInvokeRoutes(ctx as any);
    const res = await app.request('/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Do something' }),
    });
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.success).toBe(false);
    expect(body.error).toContain('No invoke model configured');
  });

  test('POST /invoke returns 500 on error', async () => {
    const ctx = createMockCtx();
    ctx.framework.createTempAgent = vi
      .fn()
      .mockRejectedValue(new Error('boom'));
    const app = createInvokeRoutes(ctx as any);
    const res = await app.request('/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Do something' }),
    });
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });
});
