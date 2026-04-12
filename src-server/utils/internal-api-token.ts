const INTERNAL_API_TOKEN_KEY = Symbol.for('stallion.internalApiToken');

type InternalGlobal = typeof globalThis & {
  [INTERNAL_API_TOKEN_KEY]?: string;
};

export const INTERNAL_API_TOKEN_HEADER = 'x-stallion-internal-token';

export function getInternalApiToken(): string {
  const globalState = globalThis as InternalGlobal;
  if (!globalState[INTERNAL_API_TOKEN_KEY]) {
    globalState[INTERNAL_API_TOKEN_KEY] = crypto.randomUUID();
  }
  return globalState[INTERNAL_API_TOKEN_KEY]!;
}

export function isTrustedInternalApiToken(
  candidate: string | undefined,
): boolean {
  return typeof candidate === 'string' && candidate === getInternalApiToken();
}
