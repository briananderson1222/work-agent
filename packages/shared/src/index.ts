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
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const __shared_dir = dirname(fileURLToPath(import.meta.url));

// ── Plugin Manifest ────────────────────────────────────────────────

export interface PluginProviderEntry {
  type: string;
  module: string;
  layout?: string;
}

export interface PluginDependency {
  id: string;
  source?: string;
}

export interface PluginManifest {
  name: string;
  version: string;
  sdkVersion?: string;
  displayName?: string;
  description?: string;
  entrypoint?: string;
  build?: string;
  capabilities?: string[];
  permissions?: string[];
  agents?: Array<{ slug: string; source: string }>;
  layout?: { slug: string; source: string };
  layouts?: Array<{ slug: string; source: string }>;
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
  skills?: string[];
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

// ── Project ────────────────────────────────────────────────────────

export interface ProjectConfig {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  workingDirectory?: string;
  defaultProviderId?: string;
  defaultModel?: string;
  defaultEmbeddingProviderId?: string;
  defaultEmbeddingModel?: string;
  similarityThreshold?: number;
  topK?: number;
  agents?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMetadata {
  id: string;
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  hasWorkingDirectory: boolean;
  layoutCount: number;
  hasKnowledge: boolean;
  defaultProviderId?: string;
}

// ── Layout (renamed from Workspace) ────────────────────────────────

export interface LayoutConfig {
  id: string;
  projectSlug: string;
  type: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LayoutMetadata {
  id: string;
  slug: string;
  projectSlug: string;
  type: string;
  name: string;
  icon?: string;
  description?: string;
  plugin?: string;
  tabCount?: number;
}

export interface LayoutTab {
  id: string;
  label: string;
  component: string;
  icon?: string;
  description?: string;
  actions?: LayoutPrompt[];
  prompts?: LayoutPrompt[];
}

export interface LayoutPrompt {
  id: string;
  label: string;
  prompt: string;
  agent?: string;
}

// ── Provider Connection ────────────────────────────────────────────

export interface ProviderConnectionConfig {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  capabilities: ('llm' | 'embedding')[];
}

// ── Layout Template ────────────────────────────────────────────────

export interface LayoutTemplate {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  type: string;
  config: Record<string, unknown>;
  createdAt: string;
}

// ── Standalone Layout (file-based, not project-scoped) ─────────────

export interface StandaloneLayoutConfig {
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  plugin?: string;
  requiredProviders?: string[];
  availableAgents?: string[];
  defaultAgent?: string;
  tabs: LayoutTab[];
  globalPrompts?: LayoutPrompt[];
}

export interface StandaloneLayoutMetadata {
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
  defaultLLMProvider?: string;
  defaultEmbeddingProvider?: string;
  defaultEmbeddingModel?: string;
  defaultVectorDbProvider?: string;
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

export type {
  Notification,
  NotificationAction,
  NotificationPriority,
  NotificationStatus,
  ScheduleNotificationOpts,
} from './notifications.js';

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

export function readIntegrationDef(toolsDir: string, id: string): ToolDef {
  const p = join(toolsDir, id, 'integration.json');
  if (!existsSync(p)) throw new Error(`Integration '${id}' not found at ${p}`);
  return JSON.parse(readFileSync(p, 'utf-8'));
}

export function readAgentSpec(path: string): AgentSpec {
  if (!existsSync(path)) throw new Error(`Agent spec not found at ${path}`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function readLayoutConfig(path: string): StandaloneLayoutConfig {
  if (!existsSync(path)) throw new Error(`Layout config not found at ${path}`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function resolvePluginIntegrations(
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
        tools.set(serverId, readIntegrationDef(toolsDir, serverId));
      } catch {}
    }
  }
  return tools;
}

export function listIntegrationIds(toolsDir: string): string[] {
  if (!existsSync(toolsDir)) return [];
  return readdirSync(toolsDir, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        existsSync(join(toolsDir, d.name, 'integration.json')),
    )
    .map((d) => d.name);
}

/**
 * Copy bundled tool configs from a plugin's tools/ directory to the project tools dir.
 * Returns the list of tool IDs that were copied.
 */
export function copyPluginIntegrations(
  pluginDir: string,
  projectIntegrationsDir: string,
): string[] {
  const pluginIntegrationsDir = join(pluginDir, 'integrations');
  if (!existsSync(pluginIntegrationsDir)) return [];
  mkdirSync(projectIntegrationsDir, { recursive: true });
  // Read plugin name for source stamping
  let pluginName = '';
  try {
    pluginName = JSON.parse(
      readFileSync(join(pluginDir, 'plugin.json'), 'utf-8'),
    ).name;
  } catch {}
  const copied: string[] = [];
  for (const entry of readdirSync(pluginIntegrationsDir, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const target = join(projectIntegrationsDir, entry.name);
    if (!existsSync(target)) {
      cpSync(join(pluginIntegrationsDir, entry.name), target, {
        recursive: true,
      });
      // Stamp plugin source into integration.json
      if (pluginName) {
        const defPath = join(target, 'integration.json');
        if (existsSync(defPath)) {
          try {
            const def = JSON.parse(readFileSync(defPath, 'utf-8'));
            def.plugin = pluginName;
            writeFileSync(defPath, JSON.stringify(def, null, 2));
          } catch {}
        }
      }
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
  const serverEntry = process.argv.find(
    (a) => a.includes('src-server') || a.includes('dist-server'),
  );
  if (serverEntry) candidates.splice(1, 0, dirname(resolve(serverEntry)));

  let gitRoot: string | undefined;
  for (const dir of candidates) {
    try {
      gitRoot = execSync('git rev-parse --show-toplevel', {
        cwd: dir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      break;
    } catch {}
  }
  if (!gitRoot) throw new Error('Not a git repository');

  const branch = execSync('git rev-parse --abbrev-ref HEAD', {
    cwd: gitRoot,
    encoding: 'utf-8',
  }).trim();

  const hash = execSync('git rev-parse HEAD', {
    cwd: gitRoot,
    encoding: 'utf-8',
  })
    .trim()
    .substring(0, 7);

  let remote: string | undefined;
  try {
    remote = execSync('git remote get-url origin', {
      cwd: gitRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {}

  return { gitRoot, branch, hash, remote };
}

// ── Plugin Build ───────────────────────────────────────────────────

/** Modules provided by the host app at runtime via window.__stallion_ai_shared */
export const SHARED_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  '@stallion-ai/sdk',
  '@stallion-ai/components',
  '@tanstack/react-query',
  'dompurify',
  'debug',
  'zod',
];

/** esbuild filter regex matching all shared externals */
export const SHARED_EXTERNALS_REGEX =
  /^react$|^react\/|^@stallion-ai\/sdk$|^@stallion-ai\/components$|^@tanstack\/react-query$|^dompurify$|^debug$|^zod$/;

/** Runtime require() shim — maps externals to window.__stallion_ai_shared at runtime */
export const RUNTIME_SHIM = [
  'var __shared = (typeof window !== "undefined" && window.__stallion_ai_shared) || {};',
  'var require = globalThis.require = function(m) {',
  '  if (__shared[m]) return __shared[m];',
  '  if (m === "react" || m === "react/jsx-runtime" || m === "react/jsx-dev-runtime") return __shared["react"];',
  '  console.warn("[Plugin] Unknown shared module:", m);',
  '  return {};',
  '};',
].join('\n');

/** Registration footer — exposes plugin exports on window.__stallion_ai_plugins */
export function registrationFooter(pluginName: string): string {
  return `window.__stallion_ai_plugins = window.__stallion_ai_plugins || {}; window.__stallion_ai_plugins[${JSON.stringify(pluginName)}] = __plugin;`;
}

export interface BuildResult {
  built: boolean;
  bundlePath?: string;
  cssPath?: string;
}

/**
 * Build a plugin. Workspace plugins (with entrypoint) use esbuild JS API directly.
 * Provider-only plugins fall back to build.mjs / build.sh / npm run build.
 */
export async function buildPlugin(
  pluginDir: string,
  mode: 'production' | 'dev' = 'production',
): Promise<BuildResult> {
  const manifest = readPluginManifest(pluginDir);

  // Workspace plugins: centralized esbuild build
  if (manifest.entrypoint) {
    return buildLayoutPlugin(pluginDir, manifest, mode);
  }

  // Provider-only / custom plugins: fall back to existing scripts
  return buildCustomPlugin(pluginDir);
}

async function buildLayoutPlugin(
  pluginDir: string,
  manifest: PluginManifest,
  mode: 'production' | 'dev',
): Promise<BuildResult> {
  const isDev = mode === 'dev';
  const outfile = join(pluginDir, 'dist', `bundle${isDev ? '-dev' : ''}.js`);

  // Install deps + symlink shared
  ensurePluginDeps(pluginDir);

  mkdirSync(join(pluginDir, 'dist'), { recursive: true });

  await esbuild({
    entryPoints: [join(pluginDir, manifest.entrypoint!)],
    bundle: true,
    format: 'iife',
    globalName: '__plugin',
    outfile,
    jsx: 'automatic',
    sourcemap: isDev ? 'inline' : false,
    banner: { js: RUNTIME_SHIM },
    footer: { js: registrationFooter(manifest.name) },
    define: {
      'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
    },
    plugins: [
      {
        name: 'externalize-shared',
        setup(build) {
          build.onResolve({ filter: SHARED_EXTERNALS_REGEX }, (args) => ({
            path: args.path,
            namespace: 'shared-external',
          }));
          build.onLoad(
            { filter: /.*/, namespace: 'shared-external' },
            (args) => ({
              contents: `var _m = globalThis.require('${args.path}'); module.exports = _m; module.exports.__esModule = true; if (!module.exports.default) module.exports.default = _m;`,
              loader: 'js',
            }),
          );
        },
      },
    ],
    logLevel: 'info',
  });

  const cssPath = outfile.replace(/\.js$/, '.css');
  return {
    built: true,
    bundlePath: outfile,
    cssPath: existsSync(cssPath) ? cssPath : undefined,
  };
}

function buildCustomPlugin(pluginDir: string): BuildResult {
  const manifest = readPluginManifest(pluginDir);
  if (!manifest.build) return { built: false };

  ensurePluginDeps(pluginDir);

  execSync(manifest.build, {
    cwd: pluginDir,
    timeout: 30000,
    stdio: 'inherit',
  });
  return { built: true };
}

/** Install plugin npm deps and symlink @stallion-ai/shared */
function ensurePluginDeps(pluginDir: string): void {
  if (!existsSync(join(pluginDir, 'package.json'))) return;

  execSync('npm install --legacy-peer-deps --ignore-scripts', {
    cwd: pluginDir,
    timeout: 60000,
    stdio: 'pipe',
  });

  const sharedLink = join(pluginDir, 'node_modules', '@stallion-ai', 'shared');
  if (!existsSync(sharedLink)) {
    mkdirSync(join(pluginDir, 'node_modules', '@stallion-ai'), {
      recursive: true,
    });
    try {
      unlinkSync(sharedLink);
    } catch {}
    const devRoot = resolve(__shared_dir, '..');
    const sharedRoot = existsSync(join(devRoot, 'src', 'index.ts'))
      ? devRoot
      : resolve(__shared_dir, '..', 'packages', 'shared');
    symlinkSync(sharedRoot, sharedLink);
  }
}
