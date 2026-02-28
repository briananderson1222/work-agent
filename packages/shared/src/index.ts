/**
 * @work-agent/shared — Canonical types, config parsing, and API contracts.
 *
 * This is the SINGLE SOURCE OF TRUTH for all types shared between:
 *   - src-server (core)
 *   - packages/sdk (plugin SDK)
 *   - packages/cli (dev tooling)
 *
 * DO NOT redefine these types elsewhere. Import from here.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Plugin Manifest ────────────────────────────────────────────────

export interface PluginManifest {
  name: string;
  version: string;
  type: 'workspace' | 'agent' | 'tool';
  sdkVersion?: string;
  displayName?: string;
  description?: string;
  entrypoint?: string;
  capabilities?: string[];
  permissions?: string[];
  agents?: Array<{ slug: string; source: string }>;
  workspace?: { slug: string; source: string };
  providers?: Array<{ type: string; module: string }>;
  tools?: { required?: string[] };
}

// ── Agent ──────────────────────────────────────────────────────────

export interface AgentSpec {
  name: string;
  prompt: string;
  description?: string;
  icon?: string;
  model?: string;
  region?: string;
  maxTurns?: number;
  guardrails?: AgentGuardrails;
  streaming?: {
    useNewPipeline?: boolean;
    enableThinking?: boolean;
    debugStreaming?: boolean;
  };
  tools?: AgentTools;
  commands?: Record<string, SlashCommand>;
  ui?: AgentUIConfig;
}

export interface AgentGuardrails {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  maxSteps?: number;
}

export interface AgentTools {
  mcpServers: string[];
  available?: string[];
  autoApprove?: string[];
  aliases?: Record<string, string>;
}

export interface SlashCommand {
  name: string;
  description?: string;
  prompt: string;
  params?: SlashCommandParam[];
}

export interface SlashCommandParam {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
}

export interface AgentUIConfig {
  component?: string;
  quickPrompts?: AgentQuickPrompt[];
  workflowShortcuts?: string[];
}

export interface AgentQuickPrompt {
  id: string;
  label: string;
  prompt: string;
  agent?: string;
}

export interface AgentMetadata {
  slug: string;
  name: string;
  model?: string;
  updatedAt: string;
  description?: string;
  ui?: AgentUIConfig;
  workflowWarnings?: string[];
}

// ── Tool ───────────────────────────────────────────────────────────

export interface ToolDef {
  id: string;
  kind: 'mcp' | 'builtin';
  displayName?: string;
  description?: string;
  transport?: 'stdio' | 'sse' | 'streamable-http' | 'process' | 'ws' | 'tcp';
  command?: string;
  args?: string[];
  endpoint?: string;
  env?: Record<string, string>;
  builtinPolicy?: {
    name: 'fs_read' | 'fs_write' | 'shell_exec';
    allowedPaths?: string[];
    timeout?: number;
  };
  permissions?: ToolPermissions;
  timeouts?: { startupMs?: number; requestMs?: number };
  healthCheck?: {
    kind?: 'jsonrpc' | 'http' | 'command';
    path?: string;
    intervalMs?: number;
  };
  exposedTools?: string[];
}

export interface ToolPermissions {
  filesystem?: boolean;
  network?: boolean;
  allowedPaths?: string[];
}

export interface ToolMetadata {
  id: string;
  kind: 'mcp' | 'builtin';
  displayName?: string;
  description?: string;
  transport?: string;
  source?: string;
}

// ── Workspace ──────────────────────────────────────────────────────

export interface WorkspaceConfig {
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  plugin?: string;
  requiredProviders?: string[];
  availableAgents?: string[];
  defaultAgent?: string;
  tabs: WorkspaceTab[];
  globalPrompts?: WorkspacePrompt[];
}

export interface WorkspaceTab {
  id: string;
  label: string;
  component: string;
  icon?: string;
  prompts?: WorkspacePrompt[];
}

export interface WorkspacePrompt {
  id: string;
  label: string;
  prompt: string;
  agent?: string;
}

export interface WorkspaceMetadata {
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  plugin?: string;
  tabCount: number;
}

// ── App Config ─────────────────────────────────────────────────────

export interface AppConfig {
  region: string;
  defaultModel: string;
  invokeModel: string;
  structureModel: string;
  defaultMaxTurns?: number;
  defaultMaxOutputTokens?: number;
  systemPrompt?: string;
  templateVariables?: TemplateVariable[];
  defaultChatFontSize?: number;
  registryUrl?: string;
}

export interface TemplateVariable {
  key: string;
  type: 'static' | 'date' | 'time' | 'datetime' | 'custom';
  value?: string;
  format?: string;
}

// ── API Contracts ──────────────────────────────────────────────────
// Shared between core server endpoints and dev server endpoints.
// SDK uses these as return types.

/** POST /agents/:slug/tools/:toolName — raw tool call */
export interface ToolCallResponse {
  success: boolean;
  response?: unknown;
  error?: string;
  metadata?: { toolDuration?: number };
}

/** POST /agents/:slug/invoke — agent invocation */
export interface AgentInvokeResponse {
  success: boolean;
  response?: string;
  error?: string;
  toolCalls?: Array<{ name: string; arguments: unknown; result?: unknown }>;
}

// ── Workflow / Session / Memory (core-only, re-exported) ───────────

export interface WorkflowMetadata {
  id: string;
  label: string;
  filename?: string;
  lastModified?: string;
}

export interface SessionMetadata {
  sessionId: string;
  lastTs: string;
  sizeBytes?: number;
}

export interface MemoryEvent {
  ts: string;
  sessionId: string;
  actor: 'USER' | 'ASSISTANT' | 'TOOL';
  content: string;
  meta?: Record<string, unknown>;
}

export interface ConversationStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  turns: number;
  toolCalls: number;
  estimatedCost: number;
}

export enum AgentSwitchState {
  IDLE = 'IDLE',
  WAITING = 'WAITING',
  TEARDOWN = 'TEARDOWN',
  BUILD = 'BUILD',
  READY = 'READY',
}

// ── Config Parsing ─────────────────────────────────────────────────

export function readPluginManifest(dir: string): PluginManifest {
  const p = join(dir, 'plugin.json');
  if (!existsSync(p)) throw new Error(`plugin.json not found in ${dir}`);
  return JSON.parse(readFileSync(p, 'utf-8'));
}

export function readToolDef(toolsDir: string, id: string): ToolDef {
  const p = join(toolsDir, id, 'tool.json');
  if (!existsSync(p)) throw new Error(`Tool '${id}' not found at ${p}`);
  return JSON.parse(readFileSync(p, 'utf-8'));
}

export function readAgentSpec(path: string): AgentSpec {
  if (!existsSync(path)) throw new Error(`Agent spec not found at ${path}`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function readWorkspaceConfig(path: string): WorkspaceConfig {
  if (!existsSync(path))
    throw new Error(`Workspace config not found at ${path}`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function resolvePluginTools(
  pluginDir: string,
  toolsDir: string,
): Map<string, ToolDef> {
  const manifest = readPluginManifest(pluginDir);
  const tools = new Map<string, ToolDef>();
  for (const agentRef of manifest.agents || []) {
    const agentPath = join(pluginDir, agentRef.source);
    if (!existsSync(agentPath)) continue;
    const agent = readAgentSpec(agentPath);
    for (const serverId of agent.tools?.mcpServers || []) {
      if (tools.has(serverId)) continue;
      try {
        tools.set(serverId, readToolDef(toolsDir, serverId));
      } catch {}
    }
  }
  return tools;
}

export function listToolIds(toolsDir: string): string[] {
  if (!existsSync(toolsDir)) return [];
  return readdirSync(toolsDir, { withFileTypes: true })
    .filter(
      (d) => d.isDirectory() && existsSync(join(toolsDir, d.name, 'tool.json')),
    )
    .map((d) => d.name);
}
