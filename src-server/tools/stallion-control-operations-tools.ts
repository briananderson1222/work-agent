import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  api,
  buildAnalyticsUsagePath,
  buildSentMessageResult,
  createConversationId,
  dispatchAgentMessage,
  jsonToolResult,
  navigateTo,
} from './stallion-control-shared.js';

export function registerOperationsTools(server: McpServer) {
  server.tool('list_jobs', 'List scheduled jobs', {}, async () =>
    jsonToolResult(await api('/scheduler/jobs')),
  );

  server.tool(
    'add_job',
    'Create a scheduled job',
    {
      name: z.string(),
      cron: z.string().optional().describe('Cron expression'),
      prompt: z.string().describe('Prompt to run'),
      agent: z.string().optional().describe('Agent slug (default: default)'),
    },
    async (params) =>
      jsonToolResult(
        await api('/scheduler/jobs', {
          method: 'POST',
          body: JSON.stringify(params),
        }),
      ),
  );

  server.tool(
    'run_job',
    'Run a job immediately',
    { name: z.string() },
    async ({ name }) =>
      jsonToolResult(await api(`/scheduler/jobs/${name}/run`, { method: 'POST' })),
  );

  server.tool('system_status', 'Get system health and status', {}, async () =>
    jsonToolResult(await api('/api/system/status')),
  );

  server.tool('list_models', 'List available LLM models', {}, async () =>
    jsonToolResult(await api('/api/models')),
  );

  server.tool(
    'navigate_to',
    'Navigate the Stallion UI to a specific path',
    {
      path: z
        .string()
        .describe(
          'Internal path, e.g. /projects/my-project/layouts/coding or /agents/my-agent',
        ),
    },
    async ({ path }) => jsonToolResult(await navigateTo(path)),
  );

  server.tool('list_projects', 'List all projects', {}, async () =>
    jsonToolResult(await api('/api/projects')),
  );

  server.tool(
    'get_project',
    'Get project details',
    { slug: z.string() },
    async ({ slug }) => jsonToolResult(await api(`/api/projects/${slug}`)),
  );

  server.tool(
    'list_project_layouts',
    'List layouts for a project',
    { slug: z.string() },
    async ({ slug }) =>
      jsonToolResult(await api(`/api/projects/${slug}/layouts`)),
  );

  server.tool(
    'send_message',
    'Send a message to an agent (non-blocking, returns conversation ID)',
    {
      agent: z.string().describe('Agent slug'),
      message: z.string().describe('Message content'),
      conversationId: z
        .string()
        .optional()
        .describe('Existing conversation ID to continue, or omit for new'),
      navigate: z
        .boolean()
        .optional()
        .describe('Navigate the UI to show this conversation'),
    },
    async ({ agent, message, conversationId, navigate: shouldNavigate }) => {
      const nextConversationId = createConversationId(agent, conversationId);
      await dispatchAgentMessage(agent, message, nextConversationId);
      if (shouldNavigate) {
        await navigateTo(`/agents/${agent}`);
      }
      return buildSentMessageResult(agent, nextConversationId);
    },
  );

  server.tool(
    'get_config',
    'Get app configuration (default model, theme, features, etc.)',
    {},
    async () => jsonToolResult(await api('/config/app')),
  );

  server.tool(
    'update_config',
    'Update app configuration',
    {
      updates: z
        .record(z.any())
        .describe(
          'Key-value pairs to update (e.g. { defaultModel: "claude-sonnet-4-20250514" })',
        ),
    },
    async ({ updates }) =>
      jsonToolResult(
        await api('/config/app', {
          method: 'PUT',
          body: JSON.stringify(updates),
        }),
      ),
  );

  server.tool(
    'get_usage',
    'Get usage analytics (messages, cost, tokens by date)',
    {
      from: z
        .string()
        .optional()
        .describe('Start date (YYYY-MM-DD), defaults to 14 days ago'),
      to: z
        .string()
        .optional()
        .describe('End date (YYYY-MM-DD), defaults to today'),
    },
    async ({ from, to }) =>
      jsonToolResult(await api(buildAnalyticsUsagePath(from, to))),
  );

  server.tool(
    'get_achievements',
    'Get usage achievements and milestones',
    {},
    async () => jsonToolResult(await api('/api/analytics/achievements')),
  );
}
