import type { ILLMProvider, LLMModel } from './model-provider-types.js';

const MODEL_CATALOG_TIMEOUT_MS = 1500;

export async function safeListModels(
  provider: ILLMProvider | null,
  timeoutMs: number = MODEL_CATALOG_TIMEOUT_MS,
): Promise<LLMModel[]> {
  if (!provider) {
    return [];
  }

  return Promise.race([
    provider.listModels().catch(() => []),
    new Promise<LLMModel[]>((resolve) => {
      setTimeout(() => resolve([]), timeoutMs);
    }),
  ]);
}
