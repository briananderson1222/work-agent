import { z } from 'zod';
import type { Context, Next } from 'hono';

// ACP
export const acpConnectionSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  name: z.string().optional(),
  args: z.array(z.string()).optional(),
  icon: z.string().optional(),
  enabled: z.boolean().optional(),
});

// Agent tools
export const addToolSchema = z.object({ toolId: z.string().min(1) });
export const updateAllowedSchema = z.object({ allowed: z.array(z.string()) });
export const updateAliasesSchema = z.object({ aliases: z.record(z.string(), z.string()) });

// Invoke
export const invokeSchema = z.object({
  input: z.string(),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  schema: z.any().optional(),
});

export const invokeStreamSchema = z.object({
  prompt: z.string(),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  maxSteps: z.number().int().positive().optional(),
  schema: z.any().optional(),
});

export const toolApprovalSchema = z.object({ approved: z.boolean() });

export const globalInvokeSchema = z.object({
  prompt: z.string(),
  schema: z.any().optional(),
  tools: z.array(z.string()).optional(),
  maxSteps: z.number().int().positive().optional(),
  model: z.string().optional(),
  structureModel: z.string().optional(),
  system: z.string().optional(),
});

// Chat
export const chatSchema = z.object({
  input: z.any(),
  options: z.record(z.any()).optional(),
  projectSlug: z.string().optional(),
});

// Feedback
export const rateSchema = z.object({
  messageIndex: z.number().int().min(0),
  rating: z.enum(['thumbs_up', 'thumbs_down']),
  conversationId: z.string().optional(),
  reason: z.string().optional(),
});

// Provider
export const providerSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  config: z.record(z.any()),
  enabled: z.boolean().optional(),
  capabilities: z.array(z.string()).optional(),
});

// Conversation context
export const contextActionSchema = z.object({
  action: z.string().min(1),
  content: z.any().optional(),
});

export function validate<T>(schema: z.ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    const result = schema.safeParse(await c.req.json());
    if (!result.success) {
      return c.json({ success: false, error: 'Validation failed', details: result.error.flatten() }, 400);
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
  const v = c.req.param(name);
  if (!v) throw new Error(`Missing param: ${name}`);
  return v;
}
