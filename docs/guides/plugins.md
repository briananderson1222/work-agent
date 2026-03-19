# Plugin Development

Plugins are the product — the core provides the foundation. A plugin can contribute layout UIs, agents, MCP tools, and provider implementations (auth, branding, agent registry, etc.). The SDK (`@stallion-ai/sdk`) is what plugin developers use to interact with Stallion from plugin UI code.

## Plugin Types

| Type | What it provides |
|------|-----------------|
| `workspace` | A full layout UI with tabs, agents, and optional providers |
| `agent` | Agents only — no layout UI |
| `tool` | Provider implementations only (auth, branding, registry, etc.) |

A single plugin can combine all three — e.g., a layout plugin that also registers an auth provider.

## Directory Structure

```
my-plugin/
├── plugin.json              # Manifest (required)
├── package.json             # Node package
├── layout.json              # Layout config (tabs, prompts)
├── src/
│   └── index.tsx            # UI entry point — exports `components` map
├── agents/                  # Agent configs (optional)
│   └── assistant/
│       └── agent.json
├── tools/                   # Bundled MCP tool configs (optional)
│   └── my-tool/
│       └── tool.json
└── providers/               # Server-side provider modules (optional)
    └── my-auth.js
```

## plugin.json — Manifest

All fields:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "type": "workspace",
  "sdkVersion": "^0.4.0",
  "displayName": "My Plugin",
  "description": "What this plugin does",
  "entrypoint": "src/index.tsx",
  "capabilities": ["chat", "navigation"],
  "permissions": ["navigation.dock"],
  "agents": [
    { "slug": "assistant", "source": "./agents/assistant/agent.json" }
  ],
  "layout": {
    "slug": "my-layout",
    "source": "./layout.json"
  },
  "layouts": [
    { "slug": "layout-a", "source": "./layouts/a.json" },
    { "slug": "layout-b", "source": "./layouts/b.json" }
  ],
  "providers": [
    { "type": "auth", "module": "./providers/auth.js" },
    { "type": "branding", "module": "./providers/branding.js", "layout": "my-layout" }
  ],
  "tools": {
    "required": ["my-mcp-tool"]
  },
  "dependencies": [
    { "id": "base-plugin", "source": "git@github.com:org/base-plugin.git" }
  ]
}
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Unique plugin identifier (used as install directory name) |
| `version` | string | yes | Semver version |
| `type` | `workspace` \| `agent` \| `tool` | yes | Plugin type |
| `sdkVersion` | string | no | Semver range of `@stallion-ai/sdk` required |
| `displayName` | string | no | Human-readable name shown in UI |
| `description` | string | no | Short description |
| `entrypoint` | string | no | Path to UI entry point (layout plugins only) |
| `capabilities` | string[] | no | Declared capabilities, e.g. `["chat", "navigation"]` |
| `permissions` | string[] | no | Permissions the plugin needs (see Permissions) |
| `agents` | array | no | Agent configs to install |
| `layout` | object | no | Single layout config to install |
| `layouts` | array | no | Multiple layout configs to install |
| `providers` | array | no | Server-side provider modules to load |
| `tools.required` | string[] | no | MCP tool IDs that must be installed |
| `dependencies` | array | no | Other plugins this plugin depends on |

### Provider Entry Fields

```json
{ "type": "auth", "module": "./providers/auth.js", "layout": "my-layout" }
```

| Field | Description |
|-------|-------------|
| `type` | Provider type: `auth`, `branding`, `userIdentity`, `userDirectory`, `agentRegistry`, `toolRegistry`, `onboarding`, `settings` |
| `module` | Path to the JS module (relative to plugin root) |
| `layout` | Optional — scope this provider to a specific layout slug |

### Dependency Entry Fields

```json
{ "id": "base-plugin", "source": "git@github.com:org/base-plugin.git" }
```

| Field | Description |
|-------|-------------|
| `id` | Plugin name (must match the dependency's `plugin.json` `name`) |
| `source` | Git URL or local path to install from if not already installed |

## layout.json

```json
{
  "name": "My Layout",
  "slug": "my-layout",
  "icon": "🚀",
  "description": "My layout description",
  "availableAgents": ["my-plugin:assistant"],
  "defaultAgent": "my-plugin:assistant",
  "tabs": [
    { "id": "main", "label": "Main", "component": "my-plugin-main" },
    { "id": "settings", "label": "Settings", "component": "my-plugin-settings" }
  ],
  "actions": [
    { "type": "prompt", "label": "Summarize", "data": "my-plugin:summarize" },
    { "type": "external", "label": "Docs", "icon": "📖", "data": "https://example.com" }
  ]
}
```

Tab `component` values must match keys in the `components` export from your entry point.

Agent slugs in `availableAgents` use the format `<plugin-name>:<agent-slug>`.

## Entry Point (src/index.tsx)

```tsx
import { useAgents, useAuth, useNavigation, type LayoutComponentProps } from '@stallion-ai/sdk';

function Main({ layout, activeTab, onShowChat, onLaunchPrompt }: LayoutComponentProps) {
  const agents = useAgents();
  const { status, provider, user } = useAuth();
  const { setDockState } = useNavigation();

  return (
    <div style={{ padding: '2rem' }}>
      <h1>{layout?.name}</h1>
      <button onClick={() => { setDockState(true); onShowChat?.(); }}>
        Open Chat
      </button>
    </div>
  );
}

function Settings(props: LayoutComponentProps) {
  return <div>Settings</div>;
}

export const components = {
  'my-plugin-main': Main,
  'my-plugin-settings': Settings,
};

export default Main;
```

- Export a `components` map — keys match layout.json tab `component` fields
- Components receive `LayoutComponentProps`: `{ layout, activeTab, onShowChat, onLaunchPrompt }`
- Use any hook from `@stallion-ai/sdk`
- `@tanstack/react-query` hooks share the host's QueryClient

## SDK Integration

Import everything from `@stallion-ai/sdk`. Key hooks:

### Agents & Chat

```tsx
import {
  useAgents,           // list of all available agents
  useAgent,            // single agent by slug
  useSendToChat,       // send a message to chat as a specific agent
  useSendMessage,      // send a message to the active conversation
  useConversations,    // list conversations
  useConversation,     // single conversation
  useConversationMessages, // messages in a conversation
  useCreateChatSession,    // create a new chat session
  useOpenConversation,     // open a conversation in the chat dock
} from '@stallion-ai/sdk';

// Send a message to a specific agent
const sendToChat = useSendToChat('my-plugin:assistant');
sendToChat('Summarize this document');

// Invoke an agent programmatically (no UI)
const { mutate: invoke } = useInvokeAgent();
invoke({ slug: 'my-plugin:assistant', message: 'Hello' });
```

### Auth & User

```tsx
import { useAuth, useUserLookup } from '@stallion-ai/sdk';

const { status, provider, user } = useAuth();
// status: 'valid' | 'expiring' | 'expired' | 'missing'
// user: { alias, name, email, ... }

const { lookup } = useUserLookup();
const profile = await lookup('jdoe');
```

### Navigation

```tsx
import { useNavigation } from '@stallion-ai/sdk';

const { setDockState, setLayout } = useNavigation();
setDockState(true);   // open chat dock
setDockState(false);  // close chat dock
setLayout('my-project', 'my-layout');  // navigate to a project layout
```

### Config

```tsx
import { useConfig } from '@stallion-ai/sdk';

const config = useConfig();
// config.region, config.defaultModel, config.invokeModel, ...
```

### Notifications

```tsx
import { useToast, useNotifications } from '@stallion-ai/sdk';

const { showToast } = useToast();
showToast({ type: 'success', message: 'Done!' });
showToast({ type: 'error', message: 'Something went wrong' });
showToast({ type: 'info', message: 'FYI' });
```

### Workflows & Slash Commands

```tsx
import { useWorkflows, useSlashCommands, useSlashCommandHandler } from '@stallion-ai/sdk';

const workflows = useWorkflows();
const commands = useSlashCommands();
```

### Query Hooks

For data fetching, prefer the pre-built query hooks over raw `useQuery`:

```tsx
import {
  useAgentsQuery,
  useConfigQuery,
  useProjectsQuery,
  useProjectLayoutsQuery,
  useLayoutsQuery,
  useConversationsQuery,
  useModelsQuery,
  useStatsQuery,
  useInvokeAgent,
  useApiQuery,    // generic GET
  useApiMutation, // generic POST/PUT/DELETE
} from '@stallion-ai/sdk';
```

### MCP Tool Access from Plugin UI

Call MCP tools directly from plugin UI using `callTool` from `@stallion-ai/sdk`:

```tsx
import { callTool } from '@stallion-ai/sdk';

// callTool(agentSlug, toolName, args)
const result = await callTool('my-plugin:assistant', 'search_files', { query: 'hello' });
// result: { success: boolean, response: unknown, error?: string }
```

This calls `POST /agents/:slug/tools/:toolName` on the server (or dev server). The dev server proxies this to the connected MCP process.

### Server-Side Fetch Proxy

For external HTTP calls from plugin UI (requires `network.fetch` permission):

```tsx
import { useServerFetch } from '@stallion-ai/sdk';

const { fetch: serverFetch } = useServerFetch();
const result = await serverFetch({
  url: 'https://api.example.com/data',
  method: 'GET',
  headers: { Authorization: 'Bearer ...' },
});
// result: { success, status, contentType, body }
```

### Layout Providers

Register and access layout-scoped providers from plugin UI:

```tsx
import { registerProvider, configureProvider, getProvider, hasProvider } from '@stallion-ai/sdk';

// Register a client-side provider
registerProvider('my-plugin/crm', { layout: 'my-layout', type: 'crm' }, () => myCRMProvider);

// Set it as the active provider for this layout
configureProvider('my-layout', 'crm', 'my-plugin/crm');

// Access a provider
const svc = getProvider<IMyCRMProvider>('my-layout', 'crm');
```

## Provider Interfaces

Providers are server-side modules loaded from `providers/` in your plugin. Each type has a specific interface.

### auth

```js
// providers/auth.js
module.exports = () => ({
  async getStatus() {
    // Returns: { provider, status, expiresAt, message }
    return { provider: 'my-auth', status: 'valid', expiresAt: null, message: 'OK' };
  },
  async renew() {
    // Returns: { success, message }
    return { success: true, message: 'Renewed' };
  },
});
```

### branding

```js
// providers/branding.js
module.exports = () => ({
  async getAppName() { return 'My App'; },
  async getLogo() { return { src: '/logo.png', alt: 'My App' }; },
  async getTheme() { return null; }, // or CSS custom property overrides
  async getWelcomeMessage() { return 'Welcome to My App'; },
});
```

### userIdentity

```js
module.exports = () => ({
  async getCurrentUser() {
    // Returns: { alias, name, title, email, profileUrl }
    return { alias: 'jdoe', name: 'Jane Doe' };
  },
});
```

### userDirectory

```js
module.exports = () => ({
  async lookup(alias) {
    // Returns: UserDetailVM or null
    return { alias, name: 'Jane Doe', email: `${alias}@example.com` };
  },
});
```

### agentRegistry

```js
module.exports = () => ({
  async listAvailable() {
    // Returns: Array<{ id, displayName, description, version, status, installed }>
    return [{ id: 'my-agent', displayName: 'My Agent', installed: false }];
  },
  async listInstalled() { return []; },
  async install(id) { return { success: true, message: 'Installed' }; },
  async uninstall(id) { return { success: true, message: 'Removed' }; },
});
```

Alternatively, point `module` at a JSON file and the server auto-wraps it with `JsonManifestRegistryProvider`.

### toolRegistry

Same interface as `agentRegistry` but for MCP tools.

### onboarding

```js
module.exports = () => ({
  async getPrerequisites() {
    // Returns: Array<Prerequisite>
    return [{
      id: 'my-tool',
      name: 'My Tool',
      description: 'Required for X',
      status: 'missing',
      category: 'required',
      installGuide: { steps: ['Run: brew install my-tool'], commands: ['brew install my-tool'] },
    }];
  },
});
```

### settings

```js
module.exports = () => ({
  async getSettings() { return { key: 'value' }; },
  async updateSettings(patch) { return { success: true }; },
});
```

## Plugin Permissions

Plugins declare permissions in `plugin.json`. The server enforces them at install time and runtime.

### Permission Tiers

| Tier | Behavior | Permissions |
|------|----------|-------------|
| `passive` | Auto-granted on install, no prompt | `navigation.dock`, `storage.read` |
| `active` | Requires user consent | `network.fetch`, `storage.write`, `agents.invoke`, `tools.invoke` |
| `trusted` | Requires consent + warning | `providers.register`, `system.config` |

### Declaring Permissions

```json
{
  "permissions": [
    "navigation.dock",
    "network.fetch",
    "agents.invoke"
  ]
}
```

### Runtime Enforcement

- `network.fetch` — required to use `useServerFetch` / `POST /api/plugins/:name/fetch`
- `providers.register` — required to register server-side providers
- `system.config` — required to modify app config

Grants are stored in `~/.stallion-ai/plugin-grants.json` and revoked on plugin removal.

### Managing Grants via API

```bash
# View declared vs granted permissions
GET /api/plugins/:name/permissions

# Grant permissions
POST /api/plugins/:name/grant
{ "permissions": ["network.fetch"] }
```

## Plugin Dependencies

Plugins can declare dependencies on other plugins. The server resolves and installs them automatically.

```json
{
  "dependencies": [
    { "id": "auth-plugin", "source": "git@github.com:org/auth-plugin.git" },
    { "id": "registry-plugin" }
  ]
}
```

- If `source` is provided and the dependency isn't installed, it's cloned and installed automatically
- If no `source`, the server tries the configured registry
- Dependencies are resolved recursively (cycle detection included)
- `./stallion preview <source>` shows dependency resolution status before install

## Installation Flow

### CLI

```bash
# Install from git URL
./stallion install git@github.com:org/my-plugin.git

# Install from git URL at a specific branch
./stallion install git@github.com:org/my-plugin.git#my-branch

# Install from local path
./stallion install /path/to/my-plugin

# Preview before installing (validate + show components/conflicts)
./stallion preview git@github.com:org/my-plugin.git

# Skip specific components during install
./stallion install git@github.com:org/my-plugin.git --skip=agent:my-plugin:assistant,layout:my-layout
```

### API

```bash
# Install
curl -X POST http://localhost:3141/api/plugins/install \
  -H 'Content-Type: application/json' \
  -d '{"source": "git@github.com:org/my-plugin.git"}'

# Install with skip list
curl -X POST http://localhost:3141/api/plugins/install \
  -H 'Content-Type: application/json' \
  -d '{"source": "/path/to/plugin", "skip": ["provider:auth"]}'

# Preview
curl -X POST http://localhost:3141/api/plugins/preview \
  -H 'Content-Type: application/json' \
  -d '{"source": "git@github.com:org/my-plugin.git"}'

# List installed
GET /api/plugins

# Update (git pull + rebuild)
POST /api/plugins/:name/update

# Remove
DELETE /api/plugins/:name

# Check for updates across all plugins
GET /api/plugins/check-updates
```

### What Happens on Install

1. Source is cloned (git) or copied (local path) to a temp directory
2. `plugin.json` is validated
3. Dependencies are resolved and installed recursively
4. Plugin is moved to `~/.stallion-ai/plugins/<name>/`
5. Agents are copied to `~/.stallion-ai/agents/<plugin>:<slug>/`
6. Layout config is written to `~/.stallion-ai/layouts/<slug>/layout.json`
7. Plugin is built (`./stallion build` / esbuild)
8. Bundled tool configs are copied to `~/.stallion-ai/integrations/`
9. Providers are loaded into the server
10. Passive permissions are auto-granted; active/trusted permissions are returned as `pendingConsent`

## Build System

Layout plugins (with `entrypoint`) are built automatically by the server using esbuild. No custom build script needed.

### package.json

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "./stallion build",
    "dev": "./stallion dev"
  },
  "peerDependencies": {
    "@stallion-ai/sdk": "^0.4.0",
    "react": "^18.0.0 || ^19.0.0"
  }
}
```

### Shared Modules (Externals)

These are provided by the host at runtime via `window.__stallion_ai_shared` and must NOT be bundled:

| Module | Notes |
|--------|-------|
| `react`, `react/jsx-runtime`, `react/jsx-dev-runtime` | React runtime |
| `@stallion-ai/sdk` | All SDK hooks and utilities |
| `@stallion-ai/components` | Shared UI components |
| `@tanstack/react-query` | Shares host's QueryClient |
| `dompurify` | HTML sanitization |
| `debug` | Debug logging |
| `zod` | Schema validation |

The centralized build handles externalization automatically. If you use a custom `build.mjs`, externalize these modules and add the runtime shim (see `packages/shared/src/index.ts` for `RUNTIME_SHIM` and `SHARED_EXTERNALS`).

### Output

Build produces `dist/bundle.js` (and optionally `dist/bundle.css`). Do not commit `dist/` to git — the server rebuilds on install/update.

## Development Workflow

### 1. Scaffold

```bash
./stallion init my-plugin
cd my-plugin
```

This creates the full plugin structure with a working entry point, layout config, and agent.

### 2. Dev Server

```bash
./stallion dev              # starts on port 4200
./stallion dev 3000         # custom port
./stallion dev --no-mcp     # disable MCP tool connections
./stallion dev --tools-dir=./tools  # custom tools directory
```

The dev server:
- Builds the plugin in dev mode (inline sourcemaps)
- Serves the plugin UI at `http://localhost:4200`
- Watches `src/` for changes and hot-rebuilds
- Connects to MCP servers defined in agent configs
- Provides a mock SDK (`window.__stallion_ai_shared`) that simulates the host environment
- Mirrors the same API surface as the production server:
  - `GET /agents/:slug/tools` — list available tools
  - `POST /agents/:slug/tools/:toolName` — call a tool
  - `POST /api/plugins/fetch` — server-side fetch proxy

Dependencies declared in `plugin.json` are auto-installed from `~/.stallion-ai/plugins/` on dev server start.

### 3. Build

```bash
./stallion build
```

Produces `dist/bundle.js` (production, no sourcemaps).

### 4. Install Locally for Testing

```bash
./stallion install .
```

Installs the current directory as a plugin into the running Stallion instance.

### 5. Plugin Management

```bash
./stallion list             # list installed plugins
./stallion info my-plugin   # show plugin details
./stallion update my-plugin # git pull + rebuild
./stallion remove my-plugin # uninstall
./stallion preview <source> # validate before installing
./stallion registry [url]   # browse or set registry URL
```

## Agent Config (agent.json)

```json
{
  "name": "Assistant",
  "prompt": "You are a helpful assistant.",
  "description": "General purpose assistant",
  "model": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "region": "us-east-1",
  "guardrails": {
    "maxTokens": 4096,
    "temperature": 0.7,
    "topP": 0.9,
    "maxSteps": 10
  },
  "tools": {
    "mcpServers": ["my-mcp-tool"],
    "available": ["search_files", "read_file"],
    "autoApprove": ["read_file"],
    "aliases": { "search": "search_files" }
  },
  "commands": {
    "summarize": {
      "name": "Summarize",
      "description": "Summarize the current context",
      "prompt": "Please summarize: {{input}}",
      "params": [{ "name": "input", "required": true }]
    }
  },
  "ui": {
    "component": "my-plugin-chat",
    "quickPrompts": [
      { "id": "help", "label": "Help", "prompt": "What can you help me with?" }
    ]
  }
}
```

Agent slugs are namespaced as `<plugin-name>:<agent-slug>` when installed.

## Links

Plugins can inject external links into the host UI:

```json
{
  "links": [
    {
      "label": "Activity Dashboard",
      "href": "https://example.com/dashboard",
      "icon": "/icon.png",
      "placement": "achievements"
    }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `label` | yes | Display text |
| `href` | yes | URL (opens in new tab) |
| `icon` | no | Icon image path |
| `placement` | no | `"achievements"` (profile page) or omit for global |

## Examples

| Example | Type | What it shows |
|---------|------|---------------|
| `examples/demo-layout/` | workspace | Full layout with agents, tabs, SDK hooks |
| `examples/minimal-layout/` | workspace | Minimal entry point, no agents |
| `examples/custom-branding/` | tool | Branding provider only |
| `examples/elevenlabs-voice/` | tool | STT/TTS voice provider |
| `examples/nova-sonic-voice/` | tool | Nova Sonic voice provider |
| `examples/meeting-transcription/` | tool | Context provider for meeting transcription |

### Minimal Layout (examples/minimal-layout)

```tsx
import { useAgents, useNavigation, useToast, type LayoutComponentProps } from '@stallion-ai/sdk';

export default function Main({ layout, onShowChat }: LayoutComponentProps) {
  const agents = useAgents();
  const { setDockState } = useNavigation();
  const { showToast } = useToast();

  return (
    <div style={{ padding: '2rem' }}>
      <h1>{layout?.name}</h1>
      <button onClick={() => { setDockState(true); showToast({ type: 'info', message: 'Chat opened' }); }}>
        Open Chat
      </button>
    </div>
  );
}

export const components = { 'minimal-layout-main': Main };
```

### Custom Branding (examples/custom-branding)

```js
// providers/branding.js
module.exports = () => ({
  async getAppName() { return 'Project Stallion'; },
  async getLogo() { return { src: '/favicon.png', alt: 'Stallion' }; },
  async getTheme() { return null; },
  async getWelcomeMessage() { return 'Welcome to Project Stallion'; },
});
```

```json
{
  "name": "custom-branding",
  "version": "1.0.0",
  "type": "tool",
  "providers": [{ "type": "branding", "module": "./providers/branding.js" }]
}
```
