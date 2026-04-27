# Developer Guide

This guide keeps contributor and operator detail out of the public README while preserving the commands and conventions needed to work on Stallion.

## Local Runtime

Prefer the `./stallion` CLI for starting and stopping the app. It coordinates server, UI, build artifacts, instance state, and data directories.

```bash
./stallion --help
./stallion start --instance=dev-smoke --temp-home --clean --force --port=3242 --ui-port=5274
./stallion stop --instance=dev-smoke
./stallion doctor
```

Default ports `3141` and `3000` are reserved for normal user testing. Agent and contributor smoke runs should use unique ports and `--temp-home` unless the task explicitly needs the default home.

## Data Directory

Runtime state lives in `~/.stallion-ai/` by default:

```text
~/.stallion-ai/
+-- config/
|   +-- app.json
|   +-- acp.json
+-- agents/
+-- analytics/
+-- integrations/
+-- monitoring/
+-- plugins/
+-- projects/
+-- prompts/
+-- scheduler/
```

Use `STALLION_AI_DIR`, `./stallion start --base=<dir>`, or `./stallion start --temp-home` to isolate data. Deleting the default home requires `--allow-default-home-clean` in addition to `--force`.

## Packages

| Package | Path | Purpose |
| --- | --- | --- |
| `@stallion-ai/contracts` | `packages/contracts/` | Canonical cross-package API, runtime, provider, catalog, and orchestration types |
| `@stallion-ai/sdk` | `packages/sdk/` | Plugin SDK hooks, components, query domains, and client helpers |
| `@stallion-ai/connect` | `packages/connect/` | Standalone bidirectional pairing library |
| `@stallion-ai/shared` | `packages/shared/` | Shared runtime helpers and compatibility re-exports |
| `@stallion-ai/cli` | `packages/cli/` | CLI implementation behind `./stallion` |

New cross-package types should live in the owning `@stallion-ai/contracts/*` module. Keep compatibility re-exports in `shared` only when needed for older callers.

## Project Structure

```text
src-server/       Node backend, Hono routes, services, runtime adapters
src-ui/           React frontend
src-desktop/      Tauri desktop shell
packages/         Contracts, SDK, connect package, shared helpers, CLI
examples/         Plugin and provider examples
docs/             Strategy, guides, reference, design docs, Pages source
tests/            Playwright E2E specs and manifest
monitoring/       OTel collector, Prometheus, Grafana, Jaeger stack
```

## CLI Reference

Common commands:

```bash
./stallion start
./stallion stop
./stallion doctor
./stallion upgrade
./stallion config get <key>
./stallion config set <key> <value>
./stallion agents <action>
./stallion projects <action>
./stallion skills <action>
./stallion playbooks <action>
./stallion connections <action>
./stallion registry <catalog> <action>
./stallion acp <action>
```

See [../reference/cli.md](../reference/cli.md) for the complete command reference.

## Plugin Development

Create a plugin:

```bash
./stallion plugin create my-plugin --template=full
cd my-plugin
./stallion plugin build
```

Install or preview a plugin:

```bash
./stallion plugin preview git@github.com:org/my-plugin.git
./stallion plugin install git@github.com:org/my-plugin.git
./stallion plugin list
./stallion plugin remove my-plugin
```

For local SDK development:

```bash
cd packages/sdk && npm link && cd ../..
cd packages/cli && npm link && cd ../..
cd /path/to/my-plugin
npm link @stallion-ai/sdk
```

If the SDK changes, rebuild it and restart the plugin dev server:

```bash
npm run build:sdk
```

## Verification

Before marking work complete, run the smallest gate that proves the claim. For product or shared behavior changes, use the full repo gates.

```bash
npm run verify:static
npm run verify:e2e:full
npm run verify
```

Useful focused commands:

```bash
npm run build:sdk
npm run build:connect
npm run build:server
npm run build:ui
npm run test:connected-agents
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test tests/<spec>.spec.ts
```

Every Playwright spec must be assigned to exactly one bucket in `tests/e2e-manifest.mjs`.

## Observability

Every runtime feature should include OpenTelemetry instrumentation unless the plan explicitly explains why telemetry is not applicable. Add instruments in `src-server/telemetry/metrics.ts` using the existing `stallion.<domain>.<metric>` naming pattern.

Meaningful attributes include provider, runtime type, connection type, source, outcome, reason, fallback source, freshness, and project scope.

## Docs And Pages

Public positioning belongs in `README.md` and `docs/pages/`. Durable usage and contributor detail belongs under `docs/guides/` or `docs/reference/`.

Build the public site locally with:

```bash
npm run docs:pages:build
```

The generated `dist-pages/` directory is disposable and should not be edited by hand.
