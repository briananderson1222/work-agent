/**
 * @stallion-ai/shared — Canonical types, config parsing, and API contracts.
 *
 * This is the SINGLE SOURCE OF TRUTH for all types shared between:
 *   - src-server (core)
 *   - packages/sdk (plugin SDK)
 *   - packages/cli (dev tooling)
 *
 * DO NOT redefine these types elsewhere. Import from here.
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __shared_dir = dirname(fileURLToPath(import.meta.url));

// ── Plugin Manifest ────────────────────────────────────────────────

export interface PluginProviderEntry {
  type: string;
  module: string;
  workspace?: string;
}

export interface PluginDependency {
  id: string;
  source?: string;
}

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
  workspaces?: Array<{ slug: string; source: string }>;
  providers?: PluginProviderEntry[];
  tools?: { required?: string[] };
  dependencies?: PluginDependency[];
}

export interface PluginOverrideConfig {
  disabled?: string[];
}

export type PluginOverrides = Record<string, PluginOverrideConfig>;

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
  plugin?: string;
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
  description?: string;
  actions?: WorkspacePrompt[];
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
  runtime?: 'voltagent' | 'strands';
  defaultMaxTurns?: number;
  defaultMaxOutputTokens?: number;
  systemPrompt?: string;
  templateVariables?: TemplateVariable[];
  defaultChatFontSize?: number;
  registryUrl?: string;
  gitRemote?: string;
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

// ── Provider Interfaces ────────────────────────────────────────────
// Contracts that plugins implement when providing auth, user, registry, etc.

export interface RegistryItem {
  id: string;
  displayName?: string;
  description?: string;
  version?: string;
  status?: string;
  installed: boolean;
}

export interface InstallResult {
  success: boolean;
  message: string;
}

export interface AuthStatus {
  provider: string;
  status: 'valid' | 'expiring' | 'expired' | 'missing';
  expiresAt: string | null;
  message: string;
}

export interface RenewResult {
  success: boolean;
  message: string;
}

export interface UserIdentity {
  alias: string;
  name?: string;
  title?: string;
  email?: string;
  profileUrl?: string;
}

export interface UserDetailVM {
  alias: string;
  name: string;
  title?: string;
  team?: string;
  manager?: { alias: string; name?: string };
  email?: string;
  location?: string;
  avatarUrl?: string;
  profileUrl?: string;
  badges?: string[];
  tenure?: string;
  directReports?: number;
  extra?: Record<string, unknown>;
}

export interface Prerequisite {
  id: string;
  name: string;
  description: string;
  status: 'installed' | 'missing' | 'error';
  category: 'required' | 'optional';
  source?: string;
  installGuide?: {
    steps: string[];
    commands?: string[];
    links?: string[];
  };
}

// ── Plugin Preview / Validation ────────────────────────────────────

export interface ConflictInfo {
  type: 'agent' | 'workspace' | 'provider' | 'tool';
  id: string;
  existingSource?: string;
}

export interface PluginComponent {
  type: 'agent' | 'workspace' | 'provider' | 'tool';
  id: string;
  detail?: string;
  conflict?: ConflictInfo;
}

export interface PluginPreview {
  valid: boolean;
  error?: string;
  manifest?: PluginManifest;
  components: PluginComponent[];
  conflicts: ConflictInfo[];
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

/**
 * Copy bundled tool configs from a plugin's tools/ directory to the project tools dir.
 * Returns the list of tool IDs that were copied.
 */
export function copyPluginTools(
  pluginDir: string,
  projectToolsDir: string,
): string[] {
  const pluginToolsDir = join(pluginDir, 'tools');
  if (!existsSync(pluginToolsDir)) return [];
  mkdirSync(projectToolsDir, { recursive: true });
  const copied: string[] = [];
  for (const entry of readdirSync(pluginToolsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = join(projectToolsDir, entry.name);
    if (!existsSync(target)) {
      cpSync(join(pluginToolsDir, entry.name), target, { recursive: true });
      copied.push(entry.name);
    }
  }
  return copied;
}

/**
 * Resolve git info from a hint directory. Falls back through process.argv
 * for bundled environments where import.meta.url may not resolve correctly.
 */
export function resolveGitInfo(hint?: string): {
  gitRoot: string;
  branch: string;
  hash: string;
  remote?: string;
} {
  const candidates = [hint, process.cwd()].filter(Boolean) as string[];
  // Bundled server: try dist-server entry from argv
  const serverEntry = process.argv.find(a => a.includes('src-server') || a.includes('dist-server'));
  if (serverEntry) candidates.splice(1, 0, dirname(resolve(serverEntry)));

  let gitRoot: string | undefined;
  for (const dir of candidates) {
    try {
      gitRoot = execSync('git rev-parse --show-toplevel', {
        cwd: dir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      break;
    } catch {}
  }
  if (!gitRoot) throw new Error('Not a git repository');

  const branch = execSync('git rev-parse --abbrev-ref HEAD', {
    cwd: gitRoot, encoding: 'utf-8',
  }).trim();

  const hash = execSync('git rev-parse HEAD', {
    cwd: gitRoot, encoding: 'utf-8',
  }).trim().substring(0, 7);

  let remote: string | undefined;
  try {
    remote = execSync('git remote get-url origin', {
      cwd: gitRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {}

  return { gitRoot, branch, hash, remote };
}

/**
 * Build a plugin if it has a build script and no existing bundle.
 * Returns true if a build was executed.
 */
/**
 * Resolve the git root directory from a given path.
 */
export function resolveGitInfo(cwd: string): { gitRoot: string } {
  const gitRoot = execSync('git rev-parse --show-toplevel', {
    cwd,
    encoding: 'utf-8',
  }).trim();
  return { gitRoot };
}

export function buildPlugin(pluginDir: string): boolean {
  const hasBuildMjs = existsSync(join(pluginDir, 'build.mjs'));
  const hasBuildSh = existsSync(join(pluginDir, 'build.sh'));
  if (!hasBuildMjs && !hasBuildSh) return false;
  if (existsSync(join(pluginDir, 'dist', 'bundle.js'))) return false;

  if (existsSync(join(pluginDir, 'package.json'))) {
    execSync('npm install --legacy-peer-deps --ignore-scripts', {
      cwd: pluginDir, timeout: 60000, stdio: 'pipe',
    });
    // Provide @stallion-ai/shared to plugins as a peer dependency at build time
    const sharedLink = join(pluginDir, 'node_modules', '@stallion-ai', 'shared');
    if (!existsSync(sharedLink)) {
      mkdirSync(join(pluginDir, 'node_modules', '@stallion-ai'), { recursive: true });
      try { unlinkSync(sharedLink); } catch {}
      // __shared_dir is packages/shared/src in dev, but dist-server in bundle.
      // Detect by checking for the shared package's own index.ts
      const devRoot = resolve(__shared_dir, '..');
      const sharedRoot = existsSync(join(devRoot, 'src', 'index.ts'))
        ? devRoot
        : resolve(__shared_dir, '..', 'packages', 'shared');
      symlinkSync(sharedRoot, sharedLink);
    }
  }
  const cmd = hasBuildMjs ? 'node build.mjs' : 'bash build.sh';
  execSync(cmd, { cwd: pluginDir, timeout: 30000, stdio: 'inherit' });
  return true;
}
