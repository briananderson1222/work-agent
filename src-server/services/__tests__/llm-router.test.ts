import { describe, expect, test, vi } from 'vitest';

vi.mock('../telemetry/metrics.js', () => ({
  providerOps: { add: vi.fn() },
}));

const { createLLMProviderFromConfig } = await import('../llm-router.js');

describe('createLLMProviderFromConfig', () => {
  test('routes ollama config to a provider', () => {
    const result = createLLMProviderFromConfig({
      type: 'ollama',
      config: { baseUrl: 'http://localhost:11434' },
    } as any);
    expect(result).not.toBeNull();
  });

  test('routes openai-compat config to a provider', () => {
    const result = createLLMProviderFromConfig({
      type: 'openai-compat',
      config: { apiKey: 'test', baseUrl: 'http://localhost' },
    } as any);
    expect(result).not.toBeNull();
  });

  test('routes bedrock config to a provider', () => {
    const result = createLLMProviderFromConfig({
      type: 'bedrock',
      config: { region: 'us-east-1' },
    } as any);
    expect(result).not.toBeNull();
  });

  test('returns null for unknown type', () => {
    expect(createLLMProviderFromConfig({ type: 'unknown' } as any)).toBeNull();
  });
});
