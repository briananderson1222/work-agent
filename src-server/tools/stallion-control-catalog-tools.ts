import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { api, jsonToolResult } from './stallion-control-shared.js';

export const PLAYBOOK_COLLECTION_PATH = '/api/playbooks';

export function buildPlaybookPath(id?: string, action?: 'run' | 'outcome') {
  if (!id) {
    return PLAYBOOK_COLLECTION_PATH;
  }
  const encodedId = encodeURIComponent(id);
  return action
    ? `${PLAYBOOK_COLLECTION_PATH}/${encodedId}/${action}`
    : `${PLAYBOOK_COLLECTION_PATH}/${encodedId}`;
}

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

  const playbookUpsertSchema = {
    name: z.string(),
    content: z.string(),
    description: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    agent: z.string().optional(),
    global: z.boolean().optional(),
    _sourceContext: promptSourceContextSchema,
  };

  const playbookUpdateSchema = {
    id: z.string(),
    name: z.string().optional(),
    content: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    agent: z.string().optional(),
    global: z.boolean().optional(),
    _sourceContext: promptSourceContextSchema,
  };

  const registerPlaybookListTool = (
    name: 'list_playbooks' | 'list_prompts',
    description: string,
  ) => {
    server.tool(name, description, {}, async () =>
      jsonToolResult(await api(PLAYBOOK_COLLECTION_PATH)),
    );
  };

  const registerPlaybookCreateTool = (
    name: 'create_playbook' | 'create_prompt',
    description: string,
  ) => {
    server.tool(name, description, playbookUpsertSchema, async (params) =>
      jsonToolResult(
        await api(buildPlaybookPath(), {
          method: 'POST',
          body: JSON.stringify(params),
        }),
      ),
    );
  };

  const registerPlaybookUpdateTool = (
    name: 'update_playbook' | 'update_prompt',
    description: string,
  ) => {
    server.tool(
      name,
      description,
      playbookUpdateSchema,
      async ({ id, ...params }) =>
        jsonToolResult(
          await api(buildPlaybookPath(id), {
            method: 'PUT',
            body: JSON.stringify(params),
          }),
        ),
    );
  };

  const registerPlaybookRunTool = (
    name: 'track_playbook_run' | 'track_prompt_run',
    description: string,
  ) => {
    server.tool(name, description, { id: z.string() }, async ({ id }) =>
      jsonToolResult(
        await api(buildPlaybookPath(id, 'run'), {
          method: 'POST',
        }),
      ),
    );
  };

  const registerPlaybookOutcomeTool = (
    name: 'record_playbook_outcome' | 'record_prompt_outcome',
    description: string,
  ) => {
    server.tool(
      name,
      description,
      {
        id: z.string(),
        outcome: z.enum(['success', 'failure']),
      },
      async ({ id, outcome }) =>
        jsonToolResult(
          await api(buildPlaybookPath(id, 'outcome'), {
            method: 'POST',
            body: JSON.stringify({ outcome }),
          }),
        ),
    );
  };

  const registerPlaybookDeleteTool = (
    name: 'delete_playbook' | 'delete_prompt',
    description: string,
  ) => {
    server.tool(name, description, { id: z.string() }, async ({ id }) =>
      jsonToolResult(await api(buildPlaybookPath(id), { method: 'DELETE' })),
    );
  };

  registerPlaybookListTool('list_playbooks', 'List saved playbooks');
  registerPlaybookListTool(
    'list_prompts',
    'Compatibility alias for listing saved playbooks',
  );
  registerPlaybookCreateTool('create_playbook', 'Create a new playbook');
  registerPlaybookCreateTool(
    'create_prompt',
    'Compatibility alias for creating a playbook',
  );
  registerPlaybookUpdateTool('update_playbook', 'Update an existing playbook');
  registerPlaybookUpdateTool(
    'update_prompt',
    'Compatibility alias for updating a playbook',
  );
  registerPlaybookRunTool(
    'track_playbook_run',
    'Record that a playbook was used',
  );
  registerPlaybookRunTool(
    'track_prompt_run',
    'Compatibility alias for recording a playbook run',
  );
  registerPlaybookOutcomeTool(
    'record_playbook_outcome',
    'Record whether a playbook led to a successful outcome',
  );
  registerPlaybookOutcomeTool(
    'record_prompt_outcome',
    'Compatibility alias for recording a playbook outcome',
  );
  registerPlaybookDeleteTool('delete_playbook', 'Delete a playbook');
  registerPlaybookDeleteTool(
    'delete_prompt',
    'Compatibility alias for deleting a playbook',
  );
}
