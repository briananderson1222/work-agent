import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { api, jsonToolResult } from './stallion-control-shared.js';

export function registerCatalogTools(server: McpServer) {
  const promptSourceContextSchema = z
    .object({
      kind: z.enum(['agent', 'plugin', 'user']),
      agentSlug: z.string().optional(),
      conversationId: z.string().optional(),
    })
    .optional();

  server.tool('list_skills', 'List locally installed skills', {}, async () =>
    jsonToolResult(await api('/api/system/skills')),
  );

  server.tool(
    'list_registry_skills',
    'List skills available from the registry',
    {},
    async () => jsonToolResult(await api('/api/registry/skills')),
  );

  server.tool(
    'install_skill',
    'Install a skill from the registry',
    { id: z.string() },
    async ({ id }) =>
      jsonToolResult(
        await api('/api/registry/skills/install', {
          method: 'POST',
          body: JSON.stringify({ id }),
        }),
      ),
  );

  server.tool(
    'uninstall_skill',
    'Uninstall a skill',
    { id: z.string() },
    async ({ id }) =>
      jsonToolResult(
        await api(`/api/registry/skills/${id}`, { method: 'DELETE' }),
      ),
  );

  server.tool('list_prompts', 'List saved prompts', {}, async () =>
    jsonToolResult(await api('/api/prompts')),
  );

  server.tool(
    'create_prompt',
    'Create a new prompt',
    {
      name: z.string(),
      content: z.string(),
      description: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
      agent: z.string().optional(),
      global: z.boolean().optional(),
      _sourceContext: promptSourceContextSchema,
    },
    async (params) =>
      jsonToolResult(
        await api('/api/prompts', {
          method: 'POST',
          body: JSON.stringify(params),
        }),
      ),
  );

  server.tool(
    'update_prompt',
    'Update an existing prompt',
    {
      id: z.string(),
      name: z.string().optional(),
      content: z.string().optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
      agent: z.string().optional(),
      global: z.boolean().optional(),
      _sourceContext: promptSourceContextSchema,
    },
    async ({ id, ...params }) =>
      jsonToolResult(
        await api(`/api/prompts/${id}`, {
          method: 'PUT',
          body: JSON.stringify(params),
        }),
      ),
  );

  server.tool(
    'track_prompt_run',
    'Record that a prompt was used',
    { id: z.string() },
    async ({ id }) =>
      jsonToolResult(
        await api(`/api/prompts/${id}/run`, {
          method: 'POST',
        }),
      ),
  );

  server.tool(
    'record_prompt_outcome',
    'Record whether a prompt led to a successful outcome',
    {
      id: z.string(),
      outcome: z.enum(['success', 'failure']),
    },
    async ({ id, outcome }) =>
      jsonToolResult(
        await api(`/api/prompts/${id}/outcome`, {
          method: 'POST',
          body: JSON.stringify({ outcome }),
        }),
      ),
  );

  server.tool(
    'delete_prompt',
    'Delete a prompt',
    { id: z.string() },
    async ({ id }) =>
      jsonToolResult(await api(`/api/prompts/${id}`, { method: 'DELETE' })),
  );
}
