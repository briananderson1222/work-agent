#!/usr/bin/env node
/**
 * stallion-control — Built-in MCP server exposing Stallion's API as tools.
 * Runs as a stdio MCP server. Any agent can use it by adding "stallion-control"
 * to their mcpServers list.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API = `http://localhost:${process.env.STALLION_PORT || 3141}`;

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
  });
  return res.json() as Promise<any>;
}

const server = new McpServer({
  name: 'stallion-control',
  version: '1.0.0',
});

// ── Agents ──

server.tool('list_agents', 'List all configured agents', {}, async () => {
  const data = await api('/agents');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('get_agent', 'Get agent details by slug', { slug: z.string() }, async ({ slug }) => {
  const data = await api(`/agents/${slug}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('create_agent', 'Create a new agent', {
  name: z.string().describe('Display name'),
  slug: z.string().describe('URL-safe identifier'),
  model: z.string().optional().describe('Model ID'),
  systemPrompt: z.string().optional(),
  skills: z.array(z.string()).optional(),
  mcpServers: z.array(z.string()).optional().describe('Integration IDs to attach'),
}, async (params) => {
  const data = await api('/agents', { method: 'POST', body: JSON.stringify(params) });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('update_agent', 'Update an existing agent', {
  slug: z.string(),
  name: z.string().optional(),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  skills: z.array(z.string()).optional(),
  mcpServers: z.array(z.string()).optional(),
}, async ({ slug, ...updates }) => {
  const data = await api(`/agents/${slug}`, { method: 'PUT', body: JSON.stringify(updates) });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('delete_agent', 'Delete an agent', { slug: z.string() }, async ({ slug }) => {
  const data = await api(`/agents/${slug}`, { method: 'DELETE' });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Skills ──

server.tool('list_skills', 'List locally installed skills', {}, async () => {
  const data = await api('/api/system/skills');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('list_registry_skills', 'List skills available from the registry', {}, async () => {
  const data = await api('/api/registry/skills');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('install_skill', 'Install a skill from the registry', { id: z.string() }, async ({ id }) => {
  const data = await api('/api/registry/skills/install', { method: 'POST', body: JSON.stringify({ id }) });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('uninstall_skill', 'Uninstall a skill', { id: z.string() }, async ({ id }) => {
  const data = await api(`/api/registry/skills/${id}`, { method: 'DELETE' });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Integrations (Tool Servers) ──

server.tool('list_integrations', 'List configured MCP tool servers', {}, async () => {
  const data = await api('/integrations');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('get_integration', 'Get integration details', { id: z.string() }, async ({ id }) => {
  const data = await api(`/integrations/${id}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('create_integration', 'Create a new MCP tool server integration', {
  id: z.string().describe('Unique identifier'),
  displayName: z.string().optional(),
  description: z.string().optional(),
  transport: z.enum(['stdio', 'sse', 'streamable-http']).default('stdio'),
  command: z.string().optional().describe('For stdio: command to run'),
  args: z.array(z.string()).optional().describe('For stdio: command arguments'),
  endpoint: z.string().optional().describe('For sse/http: server URL'),
  env: z.record(z.string()).optional().describe('Environment variables'),
}, async (params) => {
  const data = await api('/integrations', { method: 'POST', body: JSON.stringify({ ...params, kind: 'mcp' }) });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('delete_integration', 'Remove an integration', { id: z.string() }, async ({ id }) => {
  const data = await api(`/integrations/${id}`, { method: 'DELETE' });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('list_registry_integrations', 'Browse available integrations from the registry', {}, async () => {
  const data = await api('/api/registry/integrations');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('install_registry_integration', 'Install an integration from the registry', { id: z.string() }, async ({ id }) => {
  const data = await api('/api/registry/integrations/install', { method: 'POST', body: JSON.stringify({ id }) });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Providers ──

server.tool('list_providers', 'List LLM/embedding provider connections', {}, async () => {
  const data = await api('/api/providers');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('create_provider', 'Add a new provider connection', {
  type: z.string().describe('Provider type: bedrock, ollama, openai-compat'),
  name: z.string(),
  config: z.record(z.any()).describe('Provider-specific config (region, baseUrl, apiKey, etc.)'),
}, async (params) => {
  const data = await api('/api/providers', {
    method: 'POST',
    body: JSON.stringify({ ...params, id: crypto.randomUUID(), enabled: true, capabilities: ['llm'] }),
  });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Prompts ──

server.tool('list_prompts', 'List saved prompts', {}, async () => {
  const data = await api('/api/prompts');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('create_prompt', 'Create a new prompt', {
  name: z.string(),
  content: z.string(),
  description: z.string().optional(),
}, async (params) => {
  const data = await api('/api/prompts', { method: 'POST', body: JSON.stringify(params) });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('delete_prompt', 'Delete a prompt', { id: z.string() }, async ({ id }) => {
  const data = await api(`/api/prompts/${id}`, { method: 'DELETE' });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Scheduler ──

server.tool('list_jobs', 'List scheduled jobs', {}, async () => {
  const data = await api('/scheduler/jobs');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('add_job', 'Create a scheduled job', {
  name: z.string(),
  cron: z.string().optional().describe('Cron expression'),
  prompt: z.string().describe('Prompt to run'),
  agent: z.string().optional().describe('Agent slug (default: default)'),
}, async (params) => {
  const data = await api('/scheduler/jobs', { method: 'POST', body: JSON.stringify(params) });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('run_job', 'Run a job immediately', { name: z.string() }, async ({ name }) => {
  const data = await api(`/scheduler/jobs/${name}/run`, { method: 'POST' });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── System ──

server.tool('system_status', 'Get system health and status', {}, async () => {
  const data = await api('/api/system/status');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('list_models', 'List available LLM models', {}, async () => {
  const data = await api('/api/models');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── UI Bridge ──

server.tool('navigate_to', 'Navigate the Stallion UI to a specific path', {
  path: z.string().describe('Internal path, e.g. /projects/my-project/layouts/coding or /agents/my-agent'),
}, async ({ path }) => {
  const data = await api('/api/ui', {
    method: 'POST',
    body: JSON.stringify({ command: 'navigate', payload: { path } }),
  });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Projects ──

server.tool('list_projects', 'List all projects', {}, async () => {
  const data = await api('/api/projects');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('get_project', 'Get project details', { slug: z.string() }, async ({ slug }) => {
  const data = await api(`/api/projects/${slug}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('list_project_layouts', 'List layouts for a project', { slug: z.string() }, async ({ slug }) => {
  const data = await api(`/api/projects/${slug}/layouts`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Layouts ──

server.tool('list_layouts', 'List all standalone layouts', {}, async () => {
  const data = await api('/layouts');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('get_layout', 'Get layout details', { slug: z.string() }, async ({ slug }) => {
  const data = await api(`/layouts/${slug}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Conversations ──

server.tool('list_conversations', 'List conversations for an agent', {
  agent: z.string().describe('Agent slug'),
}, async ({ agent }) => {
  const data = await api(`/agents/${agent}/conversations`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('get_conversation_messages', 'Get messages for a conversation', {
  agent: z.string().describe('Agent slug'),
  conversationId: z.string(),
}, async ({ agent, conversationId }) => {
  const data = await api(`/agents/${agent}/conversations/${conversationId}/messages`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('delete_conversation', 'Delete a conversation', {
  agent: z.string().describe('Agent slug'),
  conversationId: z.string(),
}, async ({ agent, conversationId }) => {
  const data = await api(`/agents/${agent}/conversations/${conversationId}`, { method: 'DELETE' });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('send_message', 'Send a message to an agent (non-blocking, returns conversation ID)', {
  agent: z.string().describe('Agent slug'),
  message: z.string().describe('Message content'),
  conversationId: z.string().optional().describe('Existing conversation ID to continue, or omit for new'),
  navigate: z.boolean().optional().describe('Navigate the UI to show this conversation'),
}, async ({ agent, message, conversationId, navigate: nav }) => {
  const convId = conversationId || `${agent}:${Date.now()}`;
  // Fire the chat request (non-blocking — we don't await the full stream)
  fetch(`${API}/api/agents/${agent}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: message,
      options: { conversationId: convId },
    }),
  }).catch(() => {});
  // Give it a moment to register
  await new Promise(r => setTimeout(r, 500));
  // Optionally navigate
  if (nav) {
    await api('/api/ui', {
      method: 'POST',
      body: JSON.stringify({ command: 'navigate', payload: { path: `/agents/${agent}` } }),
    });
  }
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ success: true, conversationId: convId, agent, message: 'Message sent (non-blocking)' }, null, 2),
    }],
  };
});

// ── Config ──

server.tool('get_config', 'Get app configuration (default model, theme, features, etc.)', {}, async () => {
  const data = await api('/config/app');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('update_config', 'Update app configuration', {
  updates: z.record(z.any()).describe('Key-value pairs to update (e.g. { defaultModel: "claude-sonnet-4-20250514" })'),
}, async ({ updates }) => {
  const data = await api('/config/app', { method: 'PUT', body: JSON.stringify(updates) });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Plugins ──

server.tool('list_plugins', 'List installed plugins', {}, async () => {
  const data = await api('/api/plugins');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('install_plugin', 'Install a plugin from a source path or URL', {
  source: z.string().describe('Plugin source — local path, git URL, or npm package'),
}, async ({ source }) => {
  const data = await api('/api/plugins/install', { method: 'POST', body: JSON.stringify({ source }) });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('check_plugin_updates', 'Check for available plugin updates', {}, async () => {
  const data = await api('/api/plugins/check-updates');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('update_plugin', 'Update an installed plugin', {
  name: z.string().describe('Plugin name'),
}, async ({ name }) => {
  const data = await api(`/api/plugins/${name}/update`, { method: 'POST' });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('remove_plugin', 'Remove an installed plugin', {
  name: z.string().describe('Plugin name'),
}, async ({ name }) => {
  const data = await api(`/api/plugins/${name}`, { method: 'DELETE' });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Analytics ──

server.tool('get_usage', 'Get usage analytics (messages, cost, tokens by date)', {
  from: z.string().optional().describe('Start date (YYYY-MM-DD), defaults to 14 days ago'),
  to: z.string().optional().describe('End date (YYYY-MM-DD), defaults to today'),
}, async ({ from, to }) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const data = await api(`/api/analytics/usage${qs ? `?${qs}` : ''}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('get_achievements', 'Get usage achievements and milestones', {}, async () => {
  const data = await api('/api/analytics/achievements');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Start ──

const transport = new StdioServerTransport();
await server.connect(transport);
