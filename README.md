# Stallion

Stallion is a local-first platform for building, running, and evolving AI agent workspaces.

It gives people and teams one place to use managed agents, connected runtimes, external ACP agents, project knowledge, scheduled automation, voice, plugins, and observability without locking the workspace to one model provider or one UI.

## Why Stallion

Most agent tools make you choose a lane: an IDE, a chat app, a terminal runtime, or a hosted assistant. Stallion is the platform layer underneath those experiences.

- **Any runtime, one interface** - managed agents, Claude and Codex connected runtimes, and ACP-compatible external agents run through one orchestration layer.
- **Plugins are the product** - plugins can add layouts, agents, tools, knowledge namespaces, providers, registries, skills, branding, and settings.
- **Agents can configure the platform** - the built-in `stallion-control` MCP surface lets agents create playbooks, manage skills, install integrations, schedule work, and coordinate other agents.
- **Local-first by default** - runtime data lives in `~/.stallion-ai/`, with explicit provider connections and no required cloud account for first launch.
- **Designed for teams and organizations** - provider interfaces support white-labeling, internal registries, auth, user identity, and policy-aware deployment.

## What You Can Build

Stallion can be used as:

- a local AI workspace for personal development and research
- a multi-agent control plane for Claude, Codex, managed agents, and ACP runtimes
- a plugin-powered shell for domain-specific workflows such as support, operations, research, or internal tools
- a portable configuration layer for agents, MCP tools, playbooks, skills, and project knowledge
- an on-prem or desktop-friendly foundation for organizations that need local control

## Core Capabilities

| Capability | What it does |
| --- | --- |
| Agent orchestration | Runs managed, connected, and ACP agents behind a shared event model |
| Playbooks and skills | Stores reusable prompts and executable guidance assets, with UI flows to create and convert between them |
| Project knowledge | Provides per-project document ingestion and semantic search through LanceDB |
| Plugin platform | Lets plugins contribute layouts, providers, registries, agents, tools, skills, and settings |
| MCP tools | Manages MCP server lifecycle, allow-lists, approvals, and tool execution |
| ACP connections | Connects external agent runtimes such as Kiro-compatible CLIs through Agent Communication Protocol |
| Scheduling | Runs recurring agent jobs with streaming output |
| Voice | Supports speech-to-speech providers through a pluggable interface |
| Observability | Uses OpenTelemetry metrics and traces for runtime behavior, costs, tools, providers, and UI actions |
| Portability | Imports and exports agent guidance and integration config across supported formats |

## Quick Start

### Requirements

- Node.js 20+; CI currently uses Node 24
- npm
- git

Stallion detects what is already available on your machine, including local Ollama, AWS Bedrock credentials, Claude or Codex runtimes, and ACP connections. You can start without configuring every provider up front.

### Run Locally

```bash
git clone <repo-url>
cd work-agent
./stallion start
```

Open `http://localhost:3000`.

On first run, Stallion opens a setup launcher that points you to available provider, runtime, and connection options. If something is missing, run:

```bash
./stallion doctor
```

All runtime data is stored under `~/.stallion-ai/` by default. Use `STALLION_AI_DIR`, `./stallion start --base=<dir>`, or `./stallion start --temp-home` to isolate a different data directory.

## Explore The Platform

- [Architecture](docs/architecture.md) - system map, runtime layers, plugin model, and data flow
- [Plugin Guide](docs/guides/plugins.md) - how plugins extend Stallion
- [Build Your First Plugin](docs/guides/build-your-first-plugin.md) - scaffold and run a plugin
- [ACP Guide](docs/guides/acp.md) - connect external agent runtimes
- [Agent Guide](docs/guides/agents.md) - configure managed agents, tools, and approvals
- [Self-Configuring Agent](docs/guides/self-configuring-agent.md) - let an agent manage Stallion itself
- [Testing Guide](docs/guides/testing.md) - local and CI verification lanes
- [Developer Guide](docs/guides/development.md) - contributor workflow, CLI usage, packages, and local development

## GitHub Pages Site

This repository includes a generated public site for product positioning and browsable documentation.

```bash
npm run docs:pages:build
```

The build writes `dist-pages/`. The Pages workflow publishes that output to the `gh-pages` branch while preserving the existing `updates/` directory used by desktop update manifests.

## Verification

For local development, the main gates are:

```bash
npm run verify:static
npm run verify:e2e:full
```

`npm run verify` runs both. See [Testing Guide](docs/guides/testing.md) for the full Playwright coverage contract and CI mapping.

## License

See the repository license before redistributing or packaging Stallion.
