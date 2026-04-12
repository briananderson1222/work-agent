import { z } from 'zod';

// ACP
export const acpConnectionSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  name: z.string().optional(),
  args: z.array(z.string()).optional(),
  icon: z.string().optional(),
  cwd: z.string().optional(),
  enabled: z.boolean().optional(),
});

// Integrations
export const integrationSchema = z.object({
  id: z.string().min(1),
  kind: z.string().optional(),
  transport: z
    .enum(['stdio', 'sse', 'streamable-http', 'process', 'ws', 'tcp'])
    .optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  endpoint: z.string().optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  timeouts: z
    .object({
      startupMs: z.number().optional(),
      requestMs: z.number().optional(),
    })
    .optional(),
  healthCheck: z
    .object({
      kind: z.enum(['jsonrpc', 'http', 'command']).optional(),
      path: z.string().optional(),
      intervalMs: z.number().optional(),
    })
    .optional(),
});

// Agent tools
export const addToolSchema = z.object({ toolId: z.string().min(1) });
export const updateAllowedSchema = z.object({ allowed: z.array(z.string()) });
export const updateAliasesSchema = z.object({
  aliases: z.record(z.string(), z.string()),
});

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

export const connectionSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(['model', 'runtime']),
  type: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  config: z.record(z.any()),
  enabled: z.boolean(),
  capabilities: z.array(z.string()),
  status: z
    .enum(['ready', 'degraded', 'missing_prerequisites', 'disabled', 'error'])
    .optional(),
  prerequisites: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        status: z.enum(['installed', 'missing', 'error']),
        category: z.enum(['required', 'optional']),
        source: z.string().optional(),
        installGuide: z
          .object({
            steps: z.array(z.string()),
            commands: z.array(z.string()).optional(),
            links: z.array(z.string()).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  lastCheckedAt: z.string().nullable().optional(),
});

export const modelOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  originalId: z.string(),
});

export const runtimeCatalogStatusSchema = z.object({
  source: z.enum(['live', 'cached', 'fallback', 'none']),
  fetchedAt: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  models: z.array(modelOptionSchema),
  fallbackModels: z.array(modelOptionSchema),
});

export const runtimeConnectionViewSchema = connectionSchema.extend({
  kind: z.literal('runtime'),
  runtimeCatalog: runtimeCatalogStatusSchema.optional(),
});

// Conversation context
export const contextActionSchema = z.object({
  action: z.string().min(1),
  content: z.any().optional(),
});
