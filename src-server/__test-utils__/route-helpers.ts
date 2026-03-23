import { expect } from 'vitest';

/** Send a JSON request to a Hono app and return the parsed body. */
export async function requestJSON(
  app: { request: Function },
  method: string,
  path: string,
  body?: unknown,
) {
  const res = await app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { res, body: await res.json() };
}

/** Assert a successful API response and return the body. */
export function expectSuccess(body: any) {
  expect(body.success).toBe(true);
  return body;
}

/** Assert a failed API response, optionally checking the error message. */
export function expectError(body: any, message?: string) {
  expect(body.success).toBe(false);
  if (message) expect(body.error).toContain(message);
  return body;
}
