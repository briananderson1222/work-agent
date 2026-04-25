import { z } from 'zod';
import { validateCron } from '../../services/cron.js';

const optionalCron = z
  .string()
  .optional()
  .refine((value) => !value || !validateCron(value), {
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
  notifyStart: z.boolean().optional(),
  trustAllTools: z.boolean().optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  retryDelaySecs: z.number().int().min(0).max(3600).optional(),
});
