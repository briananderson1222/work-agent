import type { Context, Next } from 'hono';
import { z } from 'zod';

export function validate<T>(schema: z.ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ success: false, error: 'Invalid JSON body' }, 400);
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: result.error.flatten(),
        },
        400,
      );
    }
    c.set('body' as never, result.data);
    await next();
  };
}

/** Retrieve the validated body set by `validate()`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBody(c: Context): any {
  return (c.get as (key: string) => unknown)('body');
}

/** Get a required route param, throwing 400 if missing. */
export function param(c: Context, name: string): string {
  const value = c.req.param(name);
  if (!value) throw new Error(`Missing param: ${name}`);
  return value;
}

/** Safely extract an error message from an unknown catch value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
