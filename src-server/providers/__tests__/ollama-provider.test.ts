import { describe, expect, test, vi } from 'vitest';
import { OllamaLLMProvider } from '../ollama-provider.js';

describe('OllamaLLMProvider', () => {
  test('throws a helpful error when chat fails because the model is unavailable', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => `{"error":"model 'missing-model' not found"}`,
    }));

    const originalFetch = global.fetch;
    global.fetch = fetchMock as any;

    try {
      const provider = new OllamaLLMProvider();
      const iterator = provider.createStream({
        model: 'missing-model',
        messages: [{ role: 'user', content: 'hello' }],
      });

      await expect(iterator.next()).rejects.toThrow(/missing-model/);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
