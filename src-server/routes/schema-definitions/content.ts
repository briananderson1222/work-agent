import { z } from 'zod';

export const promptSourceContextSchema = z.object({
  kind: z.enum(['agent', 'plugin', 'user']),
  agentSlug: z.string().optional(),
  conversationId: z.string().optional(),
});

// Prompts
export const promptCreateSchema = z.object({
  name: z.string().min(1).max(200),
  content: z.string().min(1).max(100000),
  storageMode: z.enum(['json-inline', 'markdown-file']).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  agent: z.string().optional(),
  global: z.boolean().optional(),
  _sourceContext: promptSourceContextSchema.optional(),
});

export const promptUpdateSchema = promptCreateSchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field is required',
  });

export const promptOutcomeSchema = z.object({
  outcome: z.enum(['success', 'failure']),
});

export const localSkillCreateSchema = z.object({
  name: z.string().min(1).max(200),
  body: z.string().min(1).max(100000),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  agent: z.string().optional(),
  global: z.boolean().optional(),
});

export const localSkillUpdateSchema = localSkillCreateSchema
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

// Templates
export const templateCreateSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});
