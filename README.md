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
cd stallion
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

All runtime data lives in `~/.work-agent/`:

```
~/.work-agent/
├── config/
│   ├── app.json          # Model settings, system prompt, template vars
│   └── acp.json          # ACP connection configs
├── agents/               # Agent definitions (JSON + memory)
├── workspaces/           # Workspace configs
├── plugins/              # Installed plugin source
└── analytics/            # Usage data
```

Set `STALLION_DIR` to override the default location.

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
  ]
}
```

### Installing Plugins

From the UI: go to **Settings → Plugins**, paste a git URL or local path, and click Install.

From the CLI:

```bash
# From a git repo
wa install git@github.com:org/my-workspace.git

# From a local directory
wa install ../my-workspace

# List installed plugins
wa list

# Remove a plugin
wa remove my-workspace
```

### Plugin Bundles

Plugins ship pre-built IIFE bundles. The core loads them at runtime via `<script>` injection — no rebuild of the core platform needed. Shared dependencies (React, react-query, zod, etc.) are provided by the core via `window.__stallion_ai_shared`.

### Creating a Plugin

Use the CLI to scaffold a new workspace:

```bash
wa init my-workspace
cd my-workspace
wa build
```

Or manually:

1. Create a directory with `plugin.json`, `workspace.json`, and a `src/index.tsx`
2. Build with esbuild (see `examples/demo-workspace/build.sh` for reference)
3. Install with the CLI

See `examples/demo-workspace/` for a minimal working example.

## Packages

| Package | Path | Description |
|---------|------|-------------|
| `@stallion-ai/sdk` | `packages/sdk/` | TypeScript SDK for plugin development — hooks, components, types |
| `@stallion-ai/cli` | `packages/cli/` | Unified CLI (`wa`) for managing and developing plugins |

## Provider System

The core platform defines three provider interfaces that plugins can implement:

| Provider | Interface | Default | Purpose |
|----------|-----------|---------|---------|
| Auth | `IAuthProvider` | Always valid | Session auth status, renewal, badge photos |
| User Identity | `IUserIdentityProvider` | OS username | Current user's alias, name, email |
| User Directory | `IUserDirectoryProvider` | Stub | People lookup and search |

Providers are declared in `plugin.json` and loaded when the server starts. Each provider type has exactly one active implementation — the last plugin to register wins.

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
│   └── cli/              # @stallion-ai/cli (wa)
├── examples/
│   └── demo-workspace/   # Minimal plugin example
├── schemas/              # JSON schemas for app/agent/tool configs
├── seed/                 # Default configs bundled in Tauri builds
└── tests/                # Playwright integration tests
```

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

The Tauri app bundles the Node.js server and serves the UI. On first launch, it seeds `~/.work-agent/` with default configs from the bundled `seed/` directory.

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

## License

MIT
