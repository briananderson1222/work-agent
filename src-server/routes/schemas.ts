import type { Context, Next } from 'hono';
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

// Conversation context
export const contextActionSchema = z.object({
  action: z.string().min(1),
  content: z.any().optional(),
});

// Scheduler
import { validateCron } from '../services/cron.js';

const optionalCron = z
  .string()
  .optional()
  .refine((v) => !v || !validateCron(v), {
    message: 'Invalid cron expression',
  });

export const addJobSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'lowercase alphanumeric + hyphens only'),
  cron: optionalCron,
  prompt: z.string().min(1),
  agent: z.string().optional(),
  provider: z.string().optional(),
  openArtifact: z.string().optional(),
  notifyStart: z.boolean().optional(),
  trustAllTools: z.boolean().optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  retryDelaySecs: z.number().int().min(0).max(3600).optional(),
});

export const editJobSchema = z.object({
  cron: optionalCron,
  prompt: z.string().optional(),
  agent: z.string().optional(),
  enabled: z.boolean().optional(),
  openArtifact: z.string().optional(),
  notifyStart: z.boolean().optional(),
  trustAllTools: z.boolean().optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  retryDelaySecs: z.number().int().min(0).max(3600).optional(),
});

export const runOutputSchema = z.object({
  path: z.string().min(1),
});

// Prompts
export const promptCreateSchema = z.object({
  name: z.string().min(1).max(200),
  content: z.string().min(1).max(100000),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  agent: z.string().optional(),
  global: z.boolean().optional(),
});

export const promptUpdateSchema = promptCreateSchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field is required',
  });

// Projects
export const projectCreateSchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().optional(),
    workingDirectory: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();

export const projectUpdateSchema = projectCreateSchema.partial();

export const projectLayoutCreateSchema = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1),
    type: z.string().optional(),
    config: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const projectLayoutUpdateSchema = projectLayoutCreateSchema
  .partial()
  .passthrough();

export const projectLayoutFromPluginSchema = z.object({
  plugin: z.string().min(1),
});

// Layouts
export const layoutCreateSchema = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1),
    type: z.string().optional(),
    config: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const layoutUpdateSchema = layoutCreateSchema.partial().passthrough();

// Workflows
export const workflowCreateSchema = z.object({
  filename: z.string().min(1),
  content: z.string(),
});

export const workflowUpdateSchema = z.object({
  content: z.string(),
});

// Agents
export const agentCreateSchema = z
  .object({
    name: z.string().min(1).max(100),
    slug: z
      .string()
      .max(50)
      .regex(/^[a-z0-9-]*$/)
      .optional(),
    prompt: z.string().max(100000).optional(),
    description: z.string().max(500).optional(),
    model: z.string().max(200).optional(),
    region: z.string().max(50).optional(),
    maxSteps: z.number().int().positive().optional(),
    icon: z.string().max(10).optional(),
  })
  .passthrough();

export const agentUpdateSchema = agentCreateSchema.partial().passthrough();

// Knowledge
export const knowledgeUploadSchema = z.object({
  filename: z.string().min(1),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export const knowledgeSearchSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive().optional(),
  namespace: z.string().optional(),
});

export const knowledgeBulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const knowledgeUpdateSchema = z.object({
  content: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const knowledgeScanSchema = z
  .object({
    extensions: z.array(z.string()).optional(),
    includePatterns: z.array(z.string()).optional(),
    excludePatterns: z.array(z.string()).optional(),
  })
  .optional();

export const knowledgeNamespaceCreateSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  behavior: z.string().min(1),
  description: z.string().optional(),
  builtIn: z.boolean().optional(),
  storageDir: z.string().optional(),
  writeFiles: z.boolean().optional(),
  syncOnScan: z.boolean().optional(),
  enhance: z
    .object({
      agent: z.string().min(1),
      auto: z.boolean().optional(),
    })
    .optional(),
});

export const knowledgeNamespaceUpdateSchema =
  knowledgeNamespaceCreateSchema.partial();

// Notifications
export const notificationCreateSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().optional(),
    category: z.string().optional(),
    source: z.string().optional(),
  })
  .passthrough();

export const notificationSnoozeSchema = z.object({
  until: z.string().min(1),
});

// Config
export const appConfigUpdateSchema = z.record(z.unknown());

// Templates
export const templateCreateSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

// Coding
export const execCommandSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
});

// Telemetry
export const telemetryEventsSchema = z.object({
  events: z.array(z.unknown()),
});

// Voice
export const voiceSessionCreateSchema = z.object({
  agentSlug: z.string().optional(),
});

// System
export const verifyBedrockSchema = z.object({
  region: z.string().optional(),
});

// Registry (shared shape for all install endpoints)
export const registryInstallSchema = z.object({
  id: z.string().min(1),
});

// Plugins
export const pluginPreviewSchema = z.object({
  source: z.string().min(1),
});

export const pluginInstallSchema = z.object({
  source: z.string().min(1),
  skip: z.array(z.string()).optional(),
});

export const pluginGrantSchema = z.object({
  permissions: z.array(z.string()),
});

export const pluginSettingsSchema = z.record(z.unknown());

export const pluginOverridesSchema = z.record(z.unknown());

export const pluginFetchSchema = z.object({
  url: z.string().min(1),
  method: z.string().optional(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
});

// Feedback (additional)
export const feedbackDeleteSchema = z.object({
  conversationId: z.string().optional(),
  messageIndex: z.number().int().min(0),
});

export const feedbackAnalyzeSchema = z
  .object({
    force: z.boolean().optional(),
  })
  .optional();

export const feedbackTestSchema = z
  .object({
    message: z.string().min(1),
    rating: z.string().optional(),
  })
  .passthrough();

// Conversations
export const conversationUpdateSchema = z
  .object({
    title: z.string().optional(),
  })
  .passthrough();

// Scheduler (additional)
export const schedulerOpenSchema = z.object({
  path: z.string().min(1),
});

// Skills
export const skillInstallSchema = z.object({
  id: z.string().min(1),
});

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
  const v = c.req.param(name);
  if (!v) throw new Error(`Missing param: ${name}`);
  return v;
}

/** Safely extract an error message from an unknown catch value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
