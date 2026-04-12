import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { api, jsonToolResult } from './stallion-control-shared.js';

export function registerPlatformTools(server: McpServer) {
  server.tool(
    'list_integrations',
    'List configured MCP tool servers',
    {},
    async () => jsonToolResult(await api('/integrations')),
  );

  server.tool(
    'get_integration',
    'Get integration details',
    { id: z.string() },
    async ({ id }) => jsonToolResult(await api(`/integrations/${id}`)),
  );

  server.tool(
    'create_integration',
    'Create a new MCP tool server integration',
    {
      id: z.string().describe('Unique identifier'),
      displayName: z.string().optional(),
      description: z.string().optional(),
      transport: z.enum(['stdio', 'sse', 'streamable-http']).default('stdio'),
      command: z.string().optional().describe('For stdio: command to run'),
      args: z
        .array(z.string())
        .optional()
        .describe('For stdio: command arguments'),
      endpoint: z.string().optional().describe('For sse/http: server URL'),
      env: z.record(z.string()).optional().describe('Environment variables'),
    },
    async (params) =>
      jsonToolResult(
        await api('/integrations', {
          method: 'POST',
          body: JSON.stringify({ ...params, kind: 'mcp' }),
        }),
      ),
  );

  server.tool(
    'delete_integration',
    'Remove an integration',
    { id: z.string() },
    async ({ id }) =>
      jsonToolResult(await api(`/integrations/${id}`, { method: 'DELETE' })),
  );

  server.tool(
    'list_registry_integrations',
    'Browse available integrations from the registry',
    {},
    async () => jsonToolResult(await api('/api/registry/integrations')),
  );

  server.tool(
    'install_registry_integration',
    'Install an integration from the registry',
    { id: z.string() },
    async ({ id }) =>
      jsonToolResult(
        await api('/api/registry/integrations/install', {
          method: 'POST',
          body: JSON.stringify({ id }),
        }),
      ),
  );

  server.tool(
    'list_providers',
    'List LLM/embedding provider connections',
    {},
    async () => jsonToolResult(await api('/api/providers')),
  );

  server.tool(
    'create_provider',
    'Add a new provider connection',
    {
      type: z
        .string()
        .describe('Provider type: bedrock, ollama, openai-compat'),
      name: z.string(),
      config: z
        .record(z.any())
        .describe('Provider-specific config (region, baseUrl, apiKey, etc.)'),
    },
    async (params) =>
      jsonToolResult(
        await api('/api/providers', {
          method: 'POST',
          body: JSON.stringify({
            ...params,
            id: crypto.randomUUID(),
            enabled: true,
            capabilities: ['llm'],
          }),
        }),
      ),
  );

  server.tool('list_plugins', 'List installed plugins', {}, async () =>
    jsonToolResult(await api('/api/plugins')),
  );

  server.tool(
    'install_plugin',
    'Install a plugin from a source path or URL',
    {
      source: z
        .string()
        .describe('Plugin source — local path, git URL, or npm package'),
    },
    async ({ source }) =>
      jsonToolResult(
        await api('/api/plugins/install', {
          method: 'POST',
          body: JSON.stringify({ source }),
        }),
      ),
  );

  server.tool(
    'check_plugin_updates',
    'Check for available plugin updates',
    {},
    async () => jsonToolResult(await api('/api/plugins/check-updates')),
  );

  server.tool(
    'update_plugin',
    'Update an installed plugin',
    { name: z.string().describe('Plugin name') },
    async ({ name }) =>
      jsonToolResult(
        await api(`/api/plugins/${name}/update`, { method: 'POST' }),
      ),
  );

  server.tool(
    'remove_plugin',
    'Remove an installed plugin',
    { name: z.string().describe('Plugin name') },
    async ({ name }) =>
      jsonToolResult(await api(`/api/plugins/${name}`, { method: 'DELETE' })),
  );
}
