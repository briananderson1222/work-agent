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

// ── Start ──

const transport = new StdioServerTransport();
await server.connect(transport);
