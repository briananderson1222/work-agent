import { z } from 'zod';

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

// Registry
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

// Feedback
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

// Skills
export const skillInstallSchema = z.object({
  id: z.string().min(1),
});

export const skillCreateSchema = z.object({
  name: z.string().min(1),
  source: z.enum(['local', 'registry', 'plugin']).optional(),
  path: z.string().optional(),
});
