import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { api, jsonToolResult } from './stallion-control-shared.js';

export function registerAgentTools(server: McpServer) {
  server.tool('list_agents', 'List all configured agents', {}, async () =>
    jsonToolResult(await api('/agents')),
  );

  server.tool(
    'get_agent',
    'Get agent details by slug',
    { slug: z.string() },
    async ({ slug }) => jsonToolResult(await api(`/agents/${slug}`)),
  );

  server.tool(
    'create_agent',
    'Create a new agent',
    {
      name: z.string().describe('Display name'),
      slug: z.string().describe('URL-safe identifier'),
      model: z.string().optional().describe('Model ID'),
      systemPrompt: z.string().optional(),
      skills: z.array(z.string()).optional(),
      mcpServers: z
        .array(z.string())
        .optional()
        .describe('Integration IDs to attach'),
    },
    async (params) =>
      jsonToolResult(
        await api('/agents', {
          method: 'POST',
          body: JSON.stringify(params),
        }),
      ),
  );

  server.tool(
    'update_agent',
    'Update an existing agent',
    {
      slug: z.string(),
      name: z.string().optional(),
      model: z.string().optional(),
      systemPrompt: z.string().optional(),
      skills: z.array(z.string()).optional(),
      mcpServers: z.array(z.string()).optional(),
    },
    async ({ slug, ...updates }) =>
      jsonToolResult(
        await api(`/agents/${slug}`, {
          method: 'PUT',
          body: JSON.stringify(updates),
        }),
      ),
  );

  server.tool(
    'delete_agent',
    'Delete an agent',
    { slug: z.string() },
    async ({ slug }) =>
      jsonToolResult(await api(`/agents/${slug}`, { method: 'DELETE' })),
  );

  server.tool(
    'list_conversations',
    'List conversations for an agent',
    { agent: z.string().describe('Agent slug') },
    async ({ agent }) =>
      jsonToolResult(await api(`/agents/${agent}/conversations`)),
  );

  server.tool(
    'get_conversation_messages',
    'Get messages for a conversation',
    {
      agent: z.string().describe('Agent slug'),
      conversationId: z.string(),
    },
    async ({ agent, conversationId }) =>
      jsonToolResult(
        await api(`/agents/${agent}/conversations/${conversationId}/messages`),
      ),
  );

  server.tool(
    'delete_conversation',
    'Delete a conversation',
    {
      agent: z.string().describe('Agent slug'),
      conversationId: z.string(),
    },
    async ({ agent, conversationId }) =>
      jsonToolResult(
        await api(`/agents/${agent}/conversations/${conversationId}`, {
          method: 'DELETE',
        }),
      ),
  );
}
