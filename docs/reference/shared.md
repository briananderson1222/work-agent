# @stallion-ai/shared

Canonical types, config parsing, and API contracts. Single source of truth shared between `src-server`, `packages/sdk`, and `packages/cli`. Do not redefine these types elsewhere — import from here.

---

## plugin types

### `PluginManifest`

Describes a plugin's identity, capabilities, and structure. Read from `plugin.json` at the plugin root.

```ts
interface PluginManifest {
  name: string;
  version: string;
  sdkVersion?: string;
  displayName?: string;
  description?: string;
  entrypoint?: string;
  capabilities?: string[];
  permissions?: string[];
  agents?: Array<{ slug: string; source: string }>;
  layout?: { slug: string; source: string };
  layouts?: Array<{ slug: string; source: string }>;
  providers?: PluginProviderEntry[];
  tools?: { required?: string[] };
  dependencies?: PluginDependency[];
  knowledge?: { namespaces: KnowledgeNamespaceConfig[] };
  skills?: string[];
}

interface PluginProviderEntry {
  type: string;
  module: string;
  layout?: string;
}

interface PluginDependency {
  id: string;
  source?: string;
}
```

### `PluginOverrides` / `PluginOverrideConfig`

Per-plugin runtime overrides (e.g. disabling specific agents).

```ts
interface PluginOverrideConfig {
  disabled?: string[];
}

type PluginOverrides = Record<string, PluginOverrideConfig>;
```

### `PluginPreview` / `PluginComponent` / `ConflictInfo`

Used by the plugin install preview API to report what a plugin would add and any conflicts.

```ts
interface PluginPreview {
  valid: boolean;
  error?: string;
  manifest?: PluginManifest;
  components: PluginComponent[];
  conflicts: ConflictInfo[];
}

interface PluginComponent {
  type: 'agent' | 'workspace' | 'provider' | 'tool';
  id: string;
  detail?: string;
  conflict?: ConflictInfo;
}

interface ConflictInfo {
  type: 'agent' | 'workspace' | 'provider' | 'tool';
  id: string;
  existingSource?: string;
}
```

## agent types

### `AgentSpec`

Full agent configuration loaded from an agent JSON file.

```ts
interface AgentSpec {
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

interface AgentGuardrails {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  maxSteps?: number;
}

interface AgentTools {
  mcpServers: string[];
  available?: string[];
  autoApprove?: string[];
  aliases?: Record<string, string>;
}

interface SlashCommand {
  name: string;
  description?: string;
  prompt: string;
  params?: SlashCommandParam[];
}

interface SlashCommandParam {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
}

interface AgentUIConfig {
  component?: string;
  quickPrompts?: AgentQuickPrompt[];
  workflowShortcuts?: string[];
}

interface AgentQuickPrompt {
  id: string;
  label: string;
  prompt: string;
  agent?: string;
}
```

### `AgentMetadata`

Lightweight agent summary returned by list endpoints.

```ts
interface AgentMetadata {
  slug: string;
  name: string;
  model?: string;
  updatedAt: string;
  description?: string;
  plugin?: string;
  ui?: AgentUIConfig;
  workflowWarnings?: string[];
}
```

---

## tool types

### `ToolDef`

Full tool definition loaded from `tool.json`. Describes how to launch and connect to an MCP server.

```ts
interface ToolDef {
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

interface ToolPermissions {
  filesystem?: boolean;
  network?: boolean;
  allowedPaths?: string[];
}
```

### `ToolMetadata`

Lightweight tool summary for list endpoints.

```ts
interface ToolMetadata {
  id: string;
  kind: 'mcp' | 'builtin';
  displayName?: string;
  description?: string;
  transport?: string;
  source?: string;
}
```

---

## Layout Types

### `LayoutConfig`

Full layout definition loaded from a layout JSON file.

```ts
interface LayoutConfig {
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

interface WorkspaceTab {
  id: string;
  label: string;
  component: string;
  icon?: string;
  description?: string;
  actions?: WorkspacePrompt[];
  prompts?: WorkspacePrompt[];
}

interface WorkspacePrompt {
  id: string;
  label: string;
  prompt: string;
  agent?: string;
}
```

### `WorkspaceMetadata`

```ts
interface LayoutMetadata {
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  plugin?: string;
  tabCount: number;
}
```

---

## app config

### `AppConfig`

Top-level application configuration (`app.json`).

```ts
interface AppConfig {
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

interface TemplateVariable {
  key: string;
  type: 'static' | 'date' | 'time' | 'datetime' | 'custom';
  value?: string;
  format?: string;
}
```

---

## api contracts

Shared request/response shapes used by server endpoints and the SDK.

### `ToolCallResponse`

`POST /agents/:slug/tools/:toolName`

```ts
interface ToolCallResponse {
  success: boolean;
  response?: unknown;
  error?: string;
  metadata?: { toolDuration?: number };
}
```

### `AgentInvokeResponse`

`POST /agents/:slug/invoke`

```ts
interface AgentInvokeResponse {
  success: boolean;
  response?: string;
  error?: string;
  toolCalls?: Array<{ name: string; arguments: unknown; result?: unknown }>;
}
```

---

## session / memory types

```ts
interface WorkflowMetadata {
  id: string;
  label: string;
  filename?: string;
  lastModified?: string;
}

interface SessionMetadata {
  sessionId: string;
  lastTs: string;
  sizeBytes?: number;
}

interface MemoryEvent {
  ts: string;
  sessionId: string;
  actor: 'USER' | 'ASSISTANT' | 'TOOL';
  content: string;
  meta?: Record<string, unknown>;
}

interface ConversationStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  turns: number;
  toolCalls: number;
  estimatedCost: number;
}

enum AgentSwitchState {
  IDLE = 'IDLE',
  WAITING = 'WAITING',
  TEARDOWN = 'TEARDOWN',
  BUILD = 'BUILD',
  READY = 'READY',
}
```

---

## provider interfaces

Contracts that plugins implement to provide auth, user identity, registry, and prerequisite checking.

```ts
interface RegistryItem {
  id: string;
  displayName?: string;
  description?: string;
  version?: string;
  status?: string;
  installed: boolean;
}

interface InstallResult { success: boolean; message: string; }

interface AuthStatus {
  provider: string;
  status: 'valid' | 'expiring' | 'expired' | 'missing';
  expiresAt: string | null;
  message: string;
}

interface RenewResult { success: boolean; message: string; }

interface UserIdentity {
  alias: string;
  name?: string;
  title?: string;
  email?: string;
  profileUrl?: string;
}

interface UserDetailVM {
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

interface Prerequisite {
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
```

---

## utility functions

### `readPluginManifest(dir: string): PluginManifest`

Reads and parses `plugin.json` from the given directory. Throws if the file does not exist.

```ts
import { readPluginManifest } from '@stallion-ai/shared';

const manifest = readPluginManifest('/path/to/my-plugin');
console.log(manifest.name, manifest.version);
```

### `readToolDef(toolsDir: string, id: string): ToolDef`

Reads `<toolsDir>/<id>/tool.json`. Throws if not found.

```ts
const tool = readToolDef('/project/.stallion-ai/tools', 'my-mcp-server');
```

### `readAgentSpec(path: string): AgentSpec`

Reads an agent JSON file at the given path.

### `readLayoutConfig(path: string): LayoutConfig`

Reads a layout JSON file at the given path.

### `resolvePluginTools(pluginDir: string, toolsDir: string): Map<string, ToolDef>`

Walks all agents declared in a plugin's manifest, collects their `mcpServers` references, and returns a map of `toolId → ToolDef` by reading from `toolsDir`. Silently skips missing tool definitions.

```ts
const tools = resolvePluginTools('/path/to/plugin', '/project/.stallion-ai/tools');
for (const [id, def] of tools) {
  console.log(id, def.transport);
}
```

### `listToolIds(toolsDir: string): string[]`

Returns the IDs of all tools in a directory (subdirectories that contain a `tool.json`). Returns `[]` if the directory does not exist.

```ts
const ids = listToolIds('/project/.stallion-ai/tools');
// ['my-mcp-server', 'another-tool']
```

### `copyPluginTools(pluginDir: string, projectToolsDir: string): string[]`

Copies tool configs from `<pluginDir>/tools/` into `projectToolsDir`. Skips tools that already exist. Returns the list of copied tool IDs.

```ts
const copied = copyPluginTools('/path/to/plugin', '/project/.stallion-ai/tools');
console.log('installed tools:', copied);
```

### `resolveGitInfo(hint?: string)`

Resolves git metadata (root, branch, short hash, remote) from the current working directory or an optional hint path. Falls back through `process.argv` for bundled server environments.

```ts
const { gitRoot, branch, hash, remote } = resolveGitInfo();
// { gitRoot: '/Users/...', branch: 'main', hash: 'a1b2c3d', remote: 'git@...' }
```

Throws if not inside a git repository.

### `buildPlugin(pluginDir: string): boolean`

Builds a plugin if it has a `build.mjs` or `build.sh` and no existing `dist/bundle.js`. Installs npm dependencies first and symlinks `@stallion-ai/shared` as a peer. Returns `true` if a build was executed, `false` if skipped.

```ts
const built = buildPlugin('/path/to/plugin');
if (built) console.log('plugin compiled');
```

---

## mcp helpers

Located in `@stallion-ai/shared/mcp` (re-exported from the package root).

### types

```ts
interface MCPToolInfo {
  name: string;         // prefixed: "{serverId}_{toolName}"
  originalName: string; // raw name from MCP server
  serverId: string;
  description?: string;
  inputSchema?: any;
}

interface MCPConnection {
  client: Client;       // @modelcontextprotocol/sdk Client
  serverId: string;
  tools: MCPToolInfo[];
  close: () => Promise<void>;
}

interface MCPManagerOptions {
  onStatus?: (serverId: string, status: 'connected' | 'failed', error?: string) => void;
}
```

### `connectMCP(def: ToolDef, opts?: MCPManagerOptions): Promise<MCPConnection>`

Creates and connects an MCP client from a `ToolDef`. Supports `stdio`, `sse`, and `streamable-http` transports. Discovers available tools on connect.

```ts
import { connectMCP } from '@stallion-ai/shared';

const conn = await connectMCP({
  id: 'my-server',
  kind: 'mcp',
  transport: 'stdio',
  command: 'node',
  args: ['./server.js'],
});

console.log(conn.tools.map((t) => t.name));
await conn.close();
```

### `callTool(conn: MCPConnection, toolName: string, args?: Record<string, unknown>): Promise<any>`

Calls a tool on an existing connection. Accepts both prefixed (`"server_tool"`) and raw (`"tool"`) names.

```ts
const result = await callTool(conn, 'my-server_list_files', { path: '/tmp' });
```

### `MCPManager`

Manages a pool of MCP connections for multiple tool definitions.

```ts
const manager = new MCPManager({
  onStatus: (id, status, err) => console.log(id, status, err),
});

await manager.connectAll(toolDefs);

// list all tools across all connections
const tools = manager.listTools();

// call a tool by prefixed name
const result = await manager.callTool('my-server_list_files', { path: '/tmp' });

// get a specific connection
const conn = manager.getConnection('my-server');

// shut everything down
await manager.closeAll();
```

**methods**

| method | description |
|---|---|
| `connectAll(defs: ToolDef[]): Promise<void>` | Connects to all `kind: 'mcp'` defs. Failures are reported via `onStatus`, not thrown. |
| `listTools(): MCPToolInfo[]` | Returns all tools across all active connections. |
| `callTool(prefixedName: string, args?): Promise<any>` | Routes a call to the owning connection. Throws if tool not found. |
| `getConnection(serverId: string): MCPConnection \| undefined` | Returns the connection for a specific server. |
| `closeAll(): Promise<void>` | Closes all connections and clears the pool. |

**transport selection**

| `transport` value | requirement |
|---|---|
| `stdio` | `command` required |
| `sse` | `endpoint` required |
| `streamable-http` | `endpoint` required |
| `process` (legacy) | treated as `stdio` |
| omitted | inferred as `stdio` if `command` is set |
