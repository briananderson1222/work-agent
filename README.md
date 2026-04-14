# Stallion

A local-first AI agent system with a pluggable project architecture. Works with local and hosted model providers, with dual runtime support (VoltAgent default, Strands optional).

## Overview

Stallion is a desktop-ready platform for running multiple AI agents with MCP tool integration. The core platform is generic — all domain-specific functionality (auth, user identity, layout UI) is delivered through **plugins**.

- **Plugin system** — Install plugins from git repos or local paths. No rebuild needed.
- **Provider interfaces** — Pluggable auth, user identity, and user directory. Core ships with sensible defaults (OS username, always-valid auth).
- **Agent management** — Define agents with system prompts, models, tools, and guardrails in JSON files.
- **MCP tool orchestration** — Automatic MCP server lifecycle management with allow-lists.
- **ACP connections** — Connect to external agent runtimes (kiro-cli, etc.) via the Agent Communication Protocol.
- **Desktop app** — Tauri-based native app with embedded Node.js server.

## Features

**Chat & Agents** — Multi-agent chat with conversation history, prompt management, quick prompts, slash commands, and a feedback loop that learns from user ratings.

**Knowledge & Skills** — Per-project vector knowledge base (LanceDB), skills management, and workflow orchestration.

**Voice** — Speech-to-speech via WebSocket with pluggable S2S providers (Nova Sonic built-in, ElevenLabs example plugin).

**Scheduling** — Built-in cron scheduler (Boo) for running agent prompts on a schedule, with job management UI and SSE output streaming.

**Developer Tools** — Integrated terminal sessions, coding assistance, and file browser.

**Observability** — OpenTelemetry instrumentation (~46 metric instruments), monitoring dashboard, insights analysis, notifications (SSE + browser), and usage analytics.

**Extensibility** — Plugin system, provider interfaces, MCP tools, ACP connections, template variables, and a plugin registry for discovery.

## Quick Start

### Prerequisites

- Node.js 20+ (see `.nvmrc`)
- A model path is recommended, but not required before first launch.
- Stallion will detect what is already available on your machine:
  - local Ollama on `http://localhost:11434`
  - AWS credentials for Bedrock access
  - runtime CLIs such as Claude or Codex

### Install & Run

```bash
git clone <repo-url>
cd stallion
./stallion start
```

Dependencies are installed and the app is built automatically on first run. The server starts on `http://localhost:3141` and the UI on `http://localhost:3000`.

Open `http://localhost:3000`. On first run, Stallion opens a setup launcher that points you to the right provider or runtime screen based on what it detects locally. If nothing is ready yet, `./stallion doctor` shows the exact missing pieces.

Use `./stallion --help` to see all available commands.

For development:

```bash
./stallion start --instance=dev-smoke --temp-home --clean --force --port=3242 --ui-port=5274
./stallion stop --instance=dev-smoke
./stallion doctor
```

Use `--temp-home` for routine smoke runs so cleanup stays out of your main `~/.stallion-ai` home. If you really need to delete the default home, pass `--allow-default-home-clean` in addition to `--force`. Shared-build actions (`--clean`, `fresh`, `--build`, and self-update) will refuse to run while sibling instances from the same checkout are live.

### Data Directory

All runtime data lives in `~/.stallion-ai/`:

```
~/.stallion-ai/
├── config/
│   ├── app.json          # Model settings, system prompt, template vars
│   └── acp.json          # ACP connection configs
├── agents/               # Agent definitions (JSON + memory)
├── analytics/            # Usage data
├── integrations/         # MCP tool server configs
├── monitoring/           # Event logs (NDJSON)
├── plugins/              # Installed plugin source
├── projects/             # Project definitions
├── prompts/              # Prompt templates
└── scheduler/            # Scheduled job state (created by BuiltinScheduler)
```

Set `STALLION_AI_DIR` to override the default location, or use `./stallion start --base=<dir>` / `./stallion start --temp-home` for lifecycle commands.

## Self-Configuring Agents

`stallion-control` is the built-in MCP surface that lets an agent manage Stallion itself. A managed agent can create or refine playbooks, delegate to child agents, inspect the workspace, and coordinate setup flows without leaving the platform.

- **Platform control** — agent CRUD, playbook CRUD, project/config updates, scheduler control, UI navigation, and agent-to-agent messaging
- **Safer delegation** — child agents inherit depth limits, blocked-tool lists, and approval restrictions
- **Approval stack** — human approval remains the fallback, with inbox aggregation and an optional guardian review layer for approval-bound tools
- **Richer output** — tool results can now surface structured chat blocks, notifications, and progress instead of only plain text

See [Build a Self-Configuring Agent](docs/guides/self-configuring-agent.md) for the walkthrough and [examples/self-configuring-agent](examples/self-configuring-agent/README.md) for a concrete bootstrap bundle.

## Plugin System

Plugins extend Stallion with layout UIs, agents, and providers. A plugin is a directory with a `plugin.json` manifest:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "type": "workspace",
  "displayName": "My Plugin",
  "agents": [
    { "slug": "assistant", "source": "./agents/assistant/agent.json" }
  ],
  "layout": {
    "slug": "my-layout",
    "source": "./layout.json"
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
./stallion preview git@github.com:org/my-plugin.git

# Install (resolves dependencies automatically)
./stallion install git@github.com:org/my-plugin.git

# Skip specific components
./stallion install git@github.com:org/my-plugin.git --skip=layout:my-layout

# List installed plugins
./stallion list

# Remove a plugin
./stallion remove my-plugin
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
./stallion registry              # Browse configured registry
./stallion registry <url>        # Set a remote registry URL
./stallion registry install <id> # Install a plugin from the configured registry
```

### Plugin Bundles

Plugins ship pre-built IIFE bundles. The core loads them at runtime via `<script>` injection — no rebuild of the core platform needed. Shared dependencies (React, react-query, zod, etc.) are provided by the core via `window.__stallion_ai_shared`.

### Creating a Plugin

Use the CLI to scaffold a new plugin:

```bash
./stallion create-plugin my-plugin --template=full
cd my-plugin
./stallion build
```

Templates:

- `full` — layout + agent starter
- `layout` — UI-only starter
- `provider` — server-side starter with `serverModule`

Or manually:

1. Create a directory with `plugin.json`, `layout.json, and a `src/index.tsx`
2. Build with esbuild (see `examples/demo-layout/ ` for reference)
3. Install with the CLI

See [Build Your First Plugin](docs/guides/build-your-first-plugin.md) for the fast-start tutorial, then use `examples/demo-layout/` for a minimal working example.

### Developing Plugins Locally

Plugins import `@stallion-ai/sdk` for hooks and components, and use `@stallion-ai/cli` for building and running. Both should be linked for local development.

```bash
# In stallion — link the SDK and CLI globally
cd packages/sdk && npm link && cd ../..
cd packages/cli && npm link && cd ../..

# In your plugin repo — link the SDK
cd /path/to/my-plugin
npm link @stallion-ai/sdk
```

After linking, run the CLI from your plugin directory:

```bash
# Dev server with hot reload and MCP
npx @stallion-ai/cli dev

# Build the plugin
npx @stallion-ai/cli build

# Install into the runtime
npx @stallion-ai/cli install /path/to/my-plugin
```

The `@stallion-ai/sdk` link is required for the dev server — it bundles the SDK's shared components (LayoutHeader, AuthStatusBadge) into the dev preview so what you see matches production.

If you modify the SDK, rebuild it and restart the dev server:

```bash
cd packages/sdk && npm run build
```

The npm link symlink picks up the new dist automatically.

## Packages

| Package | Path | Description |
|---------|------|-------------|
| `@stallion-ai/contracts` | `packages/contracts/` | Canonical cross-package API, runtime, and orchestration contract types |
| `@stallion-ai/sdk` | `packages/sdk/` | TypeScript SDK for plugin development — hooks, components, types |
| `@stallion-ai/connect` | `packages/connect/` | Standalone bidirectional pairing library for the Stallion AI ecosystem |
| `@stallion-ai/shared` | `packages/shared/` | Shared runtime helpers, config parsing, and compatibility re-exports |
| `@stallion-ai/cli` | `packages/cli/` | Unified CLI (`stallion`) for managing and developing plugins |

## Provider System

The core platform defines provider interfaces that plugins can implement. Contract-owned data types (`AuthStatus`, `RegistryItem`, `UserIdentity`, etc.) now live under `@stallion-ai/contracts/*`, with `@stallion-ai/shared` retaining compatibility re-exports and runtime helpers.

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
├── src-server/           # Node.js backend (Hono + Strands)
│   ├── providers/        # Provider interfaces, registry, defaults
│   ├── routes/           # API routes (agents, chat, plugins, auth, etc.)
│   ├── runtime/          # Agent framework adapters
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
│   ├── contracts/        # @stallion-ai/contracts
│   ├── sdk/              # @stallion-ai/sdk
│   ├── connect/          # @stallion-ai/connect
│   ├── shared/           # @stallion-ai/shared
│   └── cli/              # @stallion-ai/cli (stallion)
├── examples/
│   ├── demo-layout/      # Full plugin example
│   ├── minimal-layout/   # Minimal plugin example
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
./stallion start --build            # Force rebuild before starting
./stallion start --base=<dir>       # Custom data directory (default: ~/.stallion-ai)
./stallion start --log[=<path>]     # Redirect server output to log file
./stallion start --features=<flags> # Comma-separated feature flags
./stallion stop                     # Stop running processes
./stallion upgrade                  # Pull latest, rebuild
./stallion doctor                   # Check prerequisites
./stallion link                     # Add 'stallion' to PATH (/usr/local/bin)
./stallion shortcut                 # Create macOS app in ~/Applications
```

Configuration:

```bash
./stallion config                   # Show all config values
./stallion config get <key>         # Get a config value
./stallion config set <key> <value> # Set a config value
```

Plugin management:

```bash
./stallion install <git-url|path>   # Install a plugin
./stallion preview <git-url|path>   # Preview plugin contents before installing
./stallion list                     # List installed plugins
./stallion info <name>              # Show plugin details
./stallion update <name>            # Update a git-installed plugin
./stallion remove <name>            # Remove a plugin
./stallion registry [url]           # Browse or set plugin registry URL
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

> Full list of ~46 instruments in `src-server/telemetry/metrics.ts`. Additional counters cover plugins, agents, layouts, projects, prompts, providers, notifications, scheduler, MCP, knowledge, feedback, approvals, terminals, ACP, voice, templates, conversations, coding, auth, file tree, registry, skills, analytics, bedrock, config, SSE, insights, system, and UI commands.

The Grafana dashboard at `http://localhost:3333/d/stallion-overview` provides 16 panels covering requests, tokens, costs, tool usage, errors, and latency distributions.

## Scripts

> Prefer `./stallion` CLI over raw npm scripts for building and running the app.

| Script | Description |
|--------|-------------|
| **Development** | |
| `npm run dev:server` | Start backend with hot reload |
| `npm run dev:ui` | Start frontend dev server |
| `npm run dev:desktop` | Tauri dev mode with hot reload |
| `npm run cli` | Interactive CLI mode |
| **Build** | |
| `npm run build` | Build server + UI |
| `npm run build:server` | Build server only |
| `npm run build:ui` | Build UI only |
| `npm run build:desktop` | Build Tauri desktop app (.dmg / .exe) |
| `npm run clean` | Remove all build artifacts |
| **Run** | |
| `npm run start:server` | Run built server |
| `npm run start:ui` | Serve built UI (via `npx serve`) |
| **Test** | |
| `npm test` | Run unit tests (vitest, watch mode) |
| `npm run test:coverage` | Unit tests with coverage report |
| `npm run test:android` | Playwright Android device tests |
| `npx playwright test` | Run integration tests |
| `npm run install:playwright` | Install the repo-local Chromium bundle used by Playwright |
| **Lint** | |
| `npm run lint` | Biome lint check |
| `npm run lint:fix` | Biome auto-fix |
| **Release** | |
| `npm run changeset` | Create a changeset |
| `npm run version-packages` | Bump versions from changesets |
| `npm run publish-packages` | Publish packages |

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

# Integration tests (start the app first)
npm run install:playwright
./stallion start
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test tests/plugin-system.spec.ts
```

See [Testing Guide](docs/guides/testing.md) for conventions, shared utilities, and the new-feature checklist.

## Docker

### Production

```bash
docker compose up -d          # Server on :3141, UI on :5173 (nginx)
```

### Development

```bash
docker compose --profile dev up   # Hot reload, source mounted, AWS creds passed through
```

### Monitoring

```bash
cd monitoring && docker compose up -d   # Collector :4318, Prometheus :9090, Grafana :3333, Jaeger :16686
```

See [Deployment Guide](docs/guides/deployment.md) for reverse proxy setup and environment configuration.

## Documentation

### Guides
| Doc | Description |
|-----|-------------|
| [Architecture](docs/architecture.md) | System overview, diagrams, component map, data flows |
| [Agent Development](docs/guides/agents.md) | Agent config, MCP tools, guardrails, approval flow |
| [Self-Configuring Agent](docs/guides/self-configuring-agent.md) | `stallion-control`, delegation, playbook refinement, workspace bootstrap |
| [Plugins](docs/guides/plugins.md) | Plugin architecture and development |
| [Custom Commands](docs/guides/commands.md) | Slash command system |
| [ACP](docs/guides/acp.md) | Agent Communication Protocol — connecting external runtimes |
| [Monitoring](docs/guides/monitoring.md) | OTel setup, metrics, Grafana, Jaeger |
| [Theming](docs/guides/theming.md) | CSS variables, branding API, custom themes |
| [Testing](docs/guides/testing.md) | Test philosophy, conventions, shared utilities, TDD policy |
| [Code Quality](docs/guides/code-quality.md) | Pre-push CI pipeline, biome lint, route typing |
| [Deployment](docs/guides/deployment.md) | Docker production, dev profile, monitoring, reverse proxy |
| [Android Build](docs/guides/android-build.md) | Tauri mobile build for Android |

### Reference
| Doc | Description |
|-----|-------------|
| [SDK](docs/reference/sdk.md) | @stallion-ai/sdk — hooks, components, types |
| [Contracts](docs/reference/contracts.md) | @stallion-ai/contracts — canonical cross-package contract modules |
| [API](docs/reference/api.md) | All endpoints (~97) with request/response shapes |
| [API Summary](docs/reference/api-summary.md) | Quick endpoint reference by category |
| [Endpoints in Use](docs/reference/endpoints.md) | Which endpoints the frontend calls |
| [Config Schemas](docs/reference/config.md) | app.json and agent.json field reference |
| [Environment Variables](docs/reference/env-vars.md) | All env vars with defaults and descriptions |
| [CLI](docs/reference/cli.md) | Full CLI command and flag reference |
| [Connect](docs/reference/connect.md) | @stallion-ai/connect — multi-device connectivity |
| [Shared](docs/reference/shared.md) | @stallion-ai/shared — runtime helpers and compatibility re-exports |

### Patterns
| Doc | Description |
|-----|-------------|
| [Backend](docs/patterns/backend.md) | Server architecture, routes, services, telemetry |
| [Frontend](docs/patterns/frontend.md) | React, hooks, styling, SDK, packages |

## License

MIT
