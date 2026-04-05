import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  bedrockOps: { add: vi.fn() },
}));

vi.mock('@aws-sdk/client-bedrock', () => ({
  BedrockClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({
      modelSummaries: [
        {
          modelId: 'anthropic.claude-3-sonnet',
          modelName: 'Claude 3 Sonnet',
          providerName: 'Anthropic',
          inputModalities: ['TEXT', 'IMAGE'],
          outputModalities: ['TEXT'],
          responseStreamingSupported: true,
          modelLifecycle: { status: 'ACTIVE' },
        },
      ],
    }),
  })),
  ListFoundationModelsCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-pricing', () => ({
  PricingClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ PriceList: [] }),
  })),
  GetProductsCommand: vi.fn(),
}));

async function json(res: Response) {
  return res.json();
}

describe('Models Routes', () => {
  // SDK useModelCapabilitiesQuery expects { success, data } where data is array
  // UI reads: modelId, supportsImages, supportsStreaming, etc.
  test('GET /capabilities returns { success, data } with capability fields', async () => {
    const { default: app } = await import('../models.js');
    const body = await json(await app.request('/capabilities'));
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    const model = body.data[0];
    expect(model).toHaveProperty('modelId');
    expect(model).toHaveProperty('modelName');
    expect(model).toHaveProperty('provider');
    expect(model).toHaveProperty('supportsImages');
    expect(model).toHaveProperty('supportsStreaming');
    expect(model.supportsImages).toBe(true);
  });

  test('GET /pricing/:modelId returns { success, data } with pricing fields', async () => {
    const { default: app } = await import('../models.js');
    const body = await json(
      await app.request('/pricing/anthropic.claude-3-sonnet'),
    );
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('modelId');
    expect(body.data).toHaveProperty('region');
    expect(body.data).toHaveProperty('currency');
  });
});
