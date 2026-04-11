import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { api, jsonToolResult } from './stallion-control-shared.js';

export function registerCatalogTools(server: McpServer) {
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
      jsonToolResult(await api(`/api/registry/skills/${id}`, { method: 'DELETE' })),
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
    'delete_prompt',
    'Delete a prompt',
    { id: z.string() },
    async ({ id }) =>
      jsonToolResult(await api(`/api/prompts/${id}`, { method: 'DELETE' })),
  );
}
