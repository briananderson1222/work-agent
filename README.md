# Stallion

A local-first AI agent system with a pluggable workspace architecture. Built on [VoltAgent](https://voltagent.dev) and Amazon Bedrock.

## Overview

Stallion is a desktop-ready platform for running multiple AI agents with MCP tool integration. The core platform is generic — all domain-specific functionality (auth, user identity, workspace UI) is delivered through **plugins**.

- **Plugin system** — Install workspace plugins from git repos or local paths. No rebuild needed.
- **Provider interfaces** — Pluggable auth, user identity, and user directory. Core ships with sensible defaults (OS username, always-valid auth).
- **Agent management** — Define agents with system prompts, models, tools, and guardrails in JSON files.
- **MCP tool orchestration** — Automatic MCP server lifecycle management with allow-lists.
- **ACP connections** — Connect to external agent runtimes (kiro-cli, etc.) via the Agent Communication Protocol.
- **Desktop app** — Tauri-based native app with embedded Node.js server.

## Quick Start

### Prerequisites

- Node.js 20+
- AWS credentials configured for Bedrock access

### Install & Run

```bash
git clone <repo-url>
cd work-agent
npm install
npm run build
npm run start:server
```

The server starts on `http://localhost:3141`. Open the UI at `http://localhost:3141` or run the dev servers separately:

```bash
npm run dev:server   # Backend on :3141
npm run dev:ui       # Frontend on :5173
```

### Data Directory

All runtime data lives in `~/.stallion-ai/`:

```
~/.stallion-ai/
├── config/
│   ├── app.json          # Model settings, system prompt, template vars
│   └── acp.json          # ACP connection configs
├── agents/               # Agent definitions (JSON + memory)
├── workspaces/           # Workspace configs
├── plugins/              # Installed plugin source
└── analytics/            # Usage data
```

Set `STALLION_AI_DIR` to override the default location.

## Plugin System

Plugins extend Stallion with workspace UIs, agents, and providers. A plugin is a directory with a `plugin.json` manifest:

```json
{
  "name": "my-workspace",
  "version": "1.0.0",
  "type": "workspace",
  "displayName": "My Workspace",
  "agents": [
    { "slug": "assistant", "source": "./agents/assistant/agent.json" }
  ],
  "workspace": {
    "slug": "my-ws",
    "source": "./workspace.json"
  },
  "providers": [
    { "type": "auth", "module": "./providers/my-auth.js" }
  ],
  "dependencies": [
    { "id": "shared-plugin", "source": "git@github.com:org/shared-plugin.git" }
  ]
}
```

### Installing Plugins

From the UI: go to **Manage → Plugins**, paste a git URL or local path, and click Install. A preview modal shows what the plugin contains — components, conflicts, and dependencies — before anything is installed. Uncheck components you don't want.

From the CLI:

```bash
# Preview what a plugin contains before installing
stallion preview git@github.com:org/my-workspace.git

# Install (resolves dependencies automatically)
stallion install git@github.com:org/my-workspace.git

# Skip specific components
stallion install git@github.com:org/my-workspace.git --skip=workspace:my-ws

# List installed plugins
stallion list

# Remove a plugin
stallion remove my-workspace
```

### Plugin Dependencies

Plugins can declare dependencies on other plugins. Dependencies are resolved recursively before the main plugin installs:

```json
{
  "dependencies": [
    { "id": "shared-tools", "source": "git@github.com:org/shared-tools.git" }
  ]
}
```

- `source` is optional — if omitted, the CLI scans installed plugins' `registry.json` files to find it
- Already-installed dependencies are skipped
- Cycle detection prevents infinite loops

### Plugin Registry

A plugin can provide a registry of available plugins by shipping a `registry.json` and declaring it as an `agentRegistry` provider:

```json
{
  "providers": [
    { "type": "agentRegistry", "module": "./registry.json" }
  ]
}
```

The registry manifest format:

```json
{
  "version": 1,
  "plugins": [
    { "id": "my-plugin", "displayName": "My Plugin", "description": "...", "version": "1.0.0", "source": "git@..." }
  ],
  "tools": []
}
```

Browse registries from the CLI:

```bash
stallion registry              # Browse configured registry
stallion registry <url>        # Set a remote registry URL
```

### Plugin Bundles

Plugins ship pre-built IIFE bundles. The core loads them at runtime via `<script>` injection — no rebuild of the core platform needed. Shared dependencies (React, react-query, zod, etc.) are provided by the core via `window.__stallion_ai_shared`.

### Creating a Plugin

Use the CLI to scaffold a new workspace:

```bash
stallion init my-workspace
cd my-workspace
stallion build
```

Or manually:

1. Create a directory with `plugin.json`, `workspace.json`, and a `src/index.tsx`
2. Build with esbuild (see `examples/demo-workspace/build.sh` for reference)
3. Install with the CLI

See `examples/demo-workspace/` for a minimal working example.

### Developing Plugins Locally

Plugins that import `@stallion-ai/shared` should declare it as a `peerDependency` — stallion provides it at build time automatically. Never use `file:` paths in your plugin's `package.json`.

For local development against an unreleased version of `@stallion-ai/shared`:

```bash
# In stallion-new/packages/shared — register the global link
npm link

# In your plugin repo — use the linked version
npm link @stallion-ai/shared
```

This creates a symlink that works regardless of directory layout and doesn't pollute your `package.json`.

## Packages

| Package | Path | Description |
|---------|------|-------------|
| `@stallion-ai/sdk` | `packages/sdk/` | TypeScript SDK for plugin development — hooks, components, types |
| `@stallion-ai/connect` | `packages/connect/` | Standalone bidirectional pairing library for the Stallion AI ecosystem |
| `@stallion-ai/shared` | `packages/shared/` | Canonical types, config parsing, and MCP client factory |
| `@stallion-ai/cli` | `packages/cli/` | Unified CLI (`stallion`) for managing and developing plugins |

## Provider System

The core platform defines provider interfaces that plugins can implement. Data types (`AuthStatus`, `RegistryItem`, `UserIdentity`, etc.) are exported from `@stallion-ai/shared` — plugins should import from there, not redefine them.

| Provider | Cardinality | Default | Purpose |
|----------|-------------|---------|---------|
| Auth | singleton | Always valid | Session auth status, renewal, badge photos |
| User Identity | singleton | OS username | Current user's alias, name, email |
| User Directory | singleton | Stub | People lookup and search |
| Branding | singleton | Stallion defaults | App name, logo, theme, welcome message |
| Settings | singleton | Built-in defaults | Default model, region, system prompt |
| Agent Registry | additive | None | Browse and install agents/plugins |
| Tool Registry | additive | None | Browse and install MCP tools |
| Onboarding | additive | None | Prerequisite checks |

Singleton providers: last plugin to register wins. Additive providers: all registered instances are merged.

Providers are declared in `plugin.json` and loaded when the server starts. For registry providers, you can use a static `.json` manifest file instead of JavaScript — the server auto-wraps it with `JsonManifestRegistryProvider`.

## Project Structure

```
├── src-server/           # Node.js backend (Hono + VoltAgent)
│   ├── providers/        # Provider interfaces, registry, defaults
│   ├── routes/           # API routes (agents, chat, plugins, auth, etc.)
│   ├── runtime/          # VoltAgent runtime wrapper
│   ├── domain/           # Config validation, agent management
│   ├── index.ts          # Server entry point
│   └── cli.ts            # Interactive CLI mode
├── src-ui/               # React frontend (Vite)
│   └── src/
│       ├── core/         # PluginRegistry, SDKAdapter, workspace providers
│       ├── views/        # Main views (workspace, settings, plugins, etc.)
│       └── components/   # Shared UI components
├── src-desktop/          # Tauri desktop app (Rust)
├── packages/
│   ├── sdk/              # @stallion-ai/sdk
│   ├── connect/          # @stallion-ai/connect
│   ├── shared/           # @stallion-ai/shared
│   └── cli/              # @stallion-ai/cli (stallion)
├── examples/
│   ├── demo-workspace/   # Full plugin example
│   ├── minimal-workspace/# Minimal plugin example
│   ├── custom-branding/  # Branding provider example
│   ├── elevenlabs-voice/ # ElevenLabs voice plugin
│   ├── nova-sonic-voice/ # Nova Sonic voice plugin
│   └── meeting-transcription/ # Transcription toolbar plugin
├── schemas/              # JSON schemas for app/agent/tool configs
├── seed/                 # Default configs bundled in Tauri builds
└── tests/                # Playwright integration tests
```

## CLI

The `./stallion` script is the unified CLI for managing the application:

```bash
./stallion start                    # Build (if needed) and start server + UI
./stallion start --port=3142        # Custom server port (default: 3141)
./stallion start --ui-port=3001     # Custom UI port (default: 3000)
./stallion stop                     # Stop running processes
./stallion upgrade                  # Pull latest, rebuild
./stallion doctor                   # Check prerequisites
```

Plugin management:

```bash
./stallion install <git-url|path>   # Install a plugin
./stallion list                     # List installed plugins
./stallion remove <name>            # Remove a plugin
./stallion dev [port]               # Plugin dev server (default: 4200)
```

## Monitoring

Stallion includes OpenTelemetry instrumentation for traces, metrics, and logs. The monitoring stack has its own compose file:

```bash
cd monitoring && docker compose up -d
```

This starts:
- **OTel Collector** (`:4318`) — receives OTLP from the app
- **Prometheus** (`:9090`) — scrapes metrics from the collector
- **Grafana** (`:3333`) — dashboards (admin/stallion)
- **Jaeger** (`:16686`) — distributed traces

To enable telemetry in the app, set the endpoint:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 ./stallion start
```

### Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `stallion.chat.requests` | Counter | Total chat requests (by agent) |
| `stallion.chat.duration` | Histogram | Request duration in ms (by agent) |
| `stallion.chat.errors` | Counter | Failed requests (by agent) |
| `stallion.tokens.input` | Counter | Input tokens consumed (by agent) |
| `stallion.tokens.output` | Counter | Output tokens generated (by agent) |
| `stallion.tokens.context` | Counter | Fixed context tokens per request (by agent) |
| `stallion.tool.calls` | Counter | Tool invocations (by tool) |
| `stallion.tool.duration` | Histogram | Tool execution time in ms (by tool) |
| `stallion.cost.estimated` | Counter | Estimated cost in USD (by agent) |
| `stallion.agents.active` | Gauge | Number of loaded agents |
| `stallion.mcp.connections` | Gauge | Number of MCP connections |

The Grafana dashboard at `http://localhost:3333/d/stallion-overview` provides 16 panels covering requests, tokens, costs, tool usage, errors, and latency distributions.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev:server` | Start backend with hot reload |
| `npm run dev:ui` | Start frontend dev server |
| `npm run build` | Build server + UI |
| `npm run build:server` | Build server only |
| `npm run build:ui` | Build UI only |
| `npm run build:desktop` | Build Tauri desktop app |
| `npm run start:server` | Run built server |
| `npm test` | Run unit tests (vitest) |
| `npx playwright test` | Run integration tests |

## Desktop App (Tauri)

The Tauri app bundles the Node.js server and serves the UI. On first launch, it seeds `~/.stallion-ai/` with default configs from the bundled `seed/` directory.

```bash
npm run build:desktop    # Build the .dmg / .exe
npm run dev:desktop      # Dev mode with hot reload
```

## Testing

```bash
# Unit tests
npm test

# Plugin system integration tests (requires server + UI running)
npm run build:server
npm run dev:ui &
npx playwright test tests/plugin-system.spec.ts
```

## Documentation

| Doc | Description |
|-----|-------------|
| [Agent Development](docs/AGENTS.md) | Agent dev guide, patterns, AI assistant reference |
| [API Summary](docs/API_SUMMARY.md) | Quick reference for all endpoints |
| [API Reference](docs/API.md) | Detailed endpoint documentation |
| [Endpoints in Use](docs/ENDPOINTS_IN_USE.md) | Which endpoints the frontend actually calls |
| [Backend Patterns](docs/BACKEND_PATTERNS.md) | Server architecture, routes, telemetry |
| [Frontend Patterns](docs/FRONTEND_PATTERNS.md) | React, hooks, styling, SDK |
| [Plugins](docs/PLUGINS.md) | Plugin architecture and development |
| [Workspace Agents](docs/WORKSPACE_AGENTS.md) | Agent configuration and management |
| [Custom Commands](docs/CUSTOM_COMMANDS.md) | Slash command system |

## License

MIT
