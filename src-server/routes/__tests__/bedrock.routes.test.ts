import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  bedrockOps: { add: vi.fn() },
}));

const { createBedrockRoutes } = await import('../bedrock.js');

function createMockCatalog() {
  return {
    listModels: vi.fn().mockResolvedValue([
      {
        modelId: 'anthropic.claude-3',
        modelName: 'Claude 3',
        providerName: 'Anthropic',
        inputModalities: ['TEXT', 'IMAGE'],
        outputModalities: ['TEXT'],
        responseStreamingSupported: true,
        inferenceTypesSupported: ['ON_DEMAND'],
      },
    ]),
    listInferenceProfiles: vi.fn().mockResolvedValue([]),
    getModelPricing: vi.fn().mockResolvedValue({
      'anthropic.claude-3': { input: 0.003, output: 0.015 },
    }),
    validateModelId: vi.fn().mockResolvedValue(true),
  };
}

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
const appConfig = { region: 'us-east-1' };

function setup(catalog = createMockCatalog()) {
  const app = createBedrockRoutes(
    () => catalog as any,
    appConfig as any,
    logger as any,
  );
  return { app, catalog };
}

async function json(res: Response) {
  return res.json();
}

describe('Bedrock Routes', () => {
  // SDK useModelsQuery expects { success, data } and reads data as model array
  test('GET /models returns { success, data } with model objects', async () => {
    const { app } = setup();
    const body = await json(await app.request('/models'));
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toHaveProperty('modelId');
    expect(body.data[0]).toHaveProperty('modelName');
  });

  test('GET /models returns 500 when catalog not initialized', async () => {
    const app = createBedrockRoutes(
      () => undefined,
      appConfig as any,
      logger as any,
    );
    const res = await app.request('/models');
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.success).toBe(false);
  });

  test('GET /pricing returns { success, data }', async () => {
    const { app } = setup();
    const body = await json(await app.request('/pricing'));
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test('GET /models/:modelId/validate returns { success, data: { modelId, isValid } }', async () => {
    const { app } = setup();
    const body = await json(
      await app.request('/models/anthropic.claude-3/validate'),
    );
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ modelId: 'anthropic.claude-3', isValid: true });
  });

  test('GET /models/:modelId returns model detail', async () => {
    const { app } = setup();
    const body = await json(await app.request('/models/anthropic.claude-3'));
    expect(body.success).toBe(true);
    expect(body.data.modelId).toBe('anthropic.claude-3');
    expect(body.data.modelName).toBe('Claude 3');
  });

  test('GET /models/:modelId returns 404 for unknown model', async () => {
    const { app } = setup();
    const res = await app.request('/models/nonexistent');
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.success).toBe(false);
  });
});
