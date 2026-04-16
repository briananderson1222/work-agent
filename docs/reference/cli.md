# CLI Reference

The Stallion CLI manages the application lifecycle, plugin system, and plugin development workflow.

## Invocation

From the repo root, use the `./stallion` shell script:

```bash
./stallion <command> [args]
```

On first run, `./stallion` bootstraps by running `npm install` if `node_modules` is missing, installs the repo-local Playwright Chromium bundle, then delegates to `packages/cli/src/cli.ts` via `tsx`.

After running `stallion link`, the `stallion` command is available globally from any directory.

Core workspace commands talk to the running local API server. By default they
target `http://127.0.0.1:3141`, or `STALLION_API_BASE` when set. Override per
command with `--api-base=<url>`.

---

## Core Workspace

These commands expose the same agent/project/skill/playbook surfaces used by
the UI and REST API. Payload-bearing commands accept JSON via:

- `--data='{"key":"value"}'`
- `--file=/absolute/or/relative/path.json`
- piped stdin

### `agents`

```
stallion agents list [--api-base=<url>]
stallion agents get <slug> [--api-base=<url>]
stallion agents create --data=<json> [--api-base=<url>]
stallion agents update <slug> --data=<json> [--api-base=<url>]
stallion agents delete <slug> [--api-base=<url>]
stallion agents conversations <slug> [--api-base=<url>]
stallion agents messages <slug> <conversationId> [--api-base=<url>]
stallion agents workflows <list|get|create|update|delete> ... [--api-base=<url>]
stallion agents chat <slug> <message> [--project=<project-slug>] [--conversation=<id>] [--model=<id>] [--api-base=<url>]
```

Examples:

```bash
stallion agents list
stallion agents create --data='{"name":"Planner","slug":"planner","prompt":"Plan carefully."}'
stallion agents update planner --file=./planner-update.json
stallion agents workflows list planner
stallion agents chat planner "Summarize the open work"
```

### `chat`

Shortcut for chatting with a configured agent.

```
stallion chat <agent> <message> [--project=<project-slug>] [--conversation=<id>] [--model=<id>] [--title=<title>] [--api-base=<url>]
```

Examples:

```bash
stallion chat default "What changed in this repo?"
printf 'Review the latest project state' | stallion chat planner
```

### `projects`

```
stallion projects list [--api-base=<url>]
stallion projects get <slug> [--api-base=<url>]
stallion projects create --data=<json> [--api-base=<url>]
stallion projects update <slug> --data=<json> [--api-base=<url>]
stallion projects delete <slug> [--api-base=<url>]
stallion projects layouts available [--api-base=<url>]
stallion projects layouts list <project> [--api-base=<url>]
stallion projects layouts get <project> <layout> [--api-base=<url>]
stallion projects layouts create <project> --data=<json> [--api-base=<url>]
stallion projects layouts update <project> <layout> --data=<json> [--api-base=<url>]
stallion projects layouts delete <project> <layout> [--api-base=<url>]
stallion projects layouts from-plugin <project> <plugin> [--api-base=<url>]
```

Example:

```bash
stallion projects create --data='{"name":"Launchpad","slug":"launchpad"}'
stallion projects layouts available
stallion projects layouts create launchpad --data='{"name":"Code","slug":"code","type":"coding"}'
```

### `skills`

```
stallion skills list [--api-base=<url>]
stallion skills get <name> [--api-base=<url>]
stallion skills create --data=<json> [--api-base=<url>]
stallion skills update <name> --data=<json> [--api-base=<url>]
stallion skills delete <name> [--api-base=<url>]
stallion skills install <name> [--api-base=<url>]
```

Example:

```bash
stallion skills create --data='{"name":"ship-it","body":"Execute the task."}'
stallion skills install code-review
```

### `playbooks`

`prompts` remains a compatibility alias.

```
stallion playbooks list [--api-base=<url>]
stallion playbooks get <id> [--api-base=<url>]
stallion playbooks create --data=<json> [--api-base=<url>]
stallion playbooks update <id> --data=<json> [--api-base=<url>]
stallion playbooks delete <id> [--api-base=<url>]
stallion playbooks run <id> [--api-base=<url>]
stallion playbooks outcome <id> <success|failure> [--api-base=<url>]
```

Example:

```bash
stallion playbooks create --data='{"name":"Triage","content":"Sort inbox items."}'
stallion prompts outcome 123e4567 success
```

---

## Application Lifecycle

### `start`

Start the application server and UI. Builds automatically on first run if `dist-server/` or `dist-ui/` are missing.

```
stallion start [--port=<n>] [--ui-port=<n>] [--clean] [--force] [--allow-default-home-clean] [--build] [--base=<dir>] [--temp-home] [--instance=<name>] [--features=<flags>] [--log[=<path>]]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--port=<n>` | `3141` | API server port |
| `--ui-port=<n>` | `3000` | UI static file server port |
| `--clean` | — | Clean the selected Stallion home before starting |
| `--force` | — | Skip the confirmation prompt for destructive cleanup |
| `--allow-default-home-clean` | — | Required together with `--force` to delete the default `~/.stallion-ai` home |
| `--build` | — | Force rebuild before starting (even if dist exists) |
| `--base=<dir>` | current `STALLION_AI_DIR` or `~/.stallion-ai` | Data directory override for this instance |
| `--temp-home` | — | Create and use a temporary home under the system temp directory |
| `--instance=<name>` | derived from `{cwd, base, ports}` | Stable instance name for targeted stop/restart flows |
| `--features=<flags>` | — | Comma-separated feature flags (e.g. `strands-runtime`) |
| `--log[=<path>]` | `/tmp/stallion-server.log` | Redirect server stdout/stderr to a log file |

Detached processes are tracked per instance in `.stallion/instances/<instance-id>.json` (see [Instance State Mechanism](#instance-state-mechanism)). During migration, legacy `.stallion.pids` state is still recognized when present.

```bash
stallion start
stallion start --instance=smoke-a --temp-home --clean --force --port=3242 --ui-port=5274
stallion start --base=/tmp/stallion-a --port=8080 --ui-port=4000
stallion start --log=/var/log/stallion.log
```

Routine smoke and agent runs should prefer `--temp-home`. Shared-build actions (`--clean`, `fresh`, `--build`, and self-update) refuse to run while sibling instances from the same checkout are still live.

### `stop`

Stop the matching Stallion instance.

```
stallion stop [--instance=<name>] [--base=<dir>] [--port=<n>] [--ui-port=<n>]
```

If multiple instances are live from the same checkout, bare `stallion stop` refuses and tells you how to disambiguate.

```bash
stallion stop
stallion stop --instance=smoke-a
stallion stop --base=/tmp/stallion-a
```

### `upgrade`

Pull the latest code, reinstall dependencies, and rebuild. Stops the app first if running. Installed plugins are preserved.

```
stallion upgrade
```

```bash
stallion upgrade
# then: stallion start
```

### `fresh`

Clean the selected Stallion home without starting the app.

```
stallion fresh [--force] [--allow-default-home-clean] [--base=<dir>] [--temp-home] [--instance=<name>] [--port=<n>] [--ui-port=<n>]
```

| Flag | Description |
|------|-------------|
| `--force` | Skip the confirmation prompt |
| `--allow-default-home-clean` | Required together with `--force` to delete the default `~/.stallion-ai` home |
| `--base=<dir>` | Clean a specific home directory |
| `--temp-home` | Create and clean a temporary home under the system temp directory |
| `--instance=<name>` / `--port=<n>` / `--ui-port=<n>` | Match the instance identity used for shared-build safety checks |

```bash
stallion fresh --temp-home --force
stallion fresh --base=/tmp/stallion-a --force
stallion fresh --force --allow-default-home-clean
```

### `doctor`

Check that all required prerequisites are installed: Node.js (≥20), npm, git, tsx. Also checks for Rust (optional, needed for desktop builds).

```
stallion doctor
```

```bash
stallion doctor
```

### `link`

Create a symlink at `/usr/local/bin/stallion` pointing to the `./stallion` script in the current directory. Prompts for `sudo` if needed.

```
stallion link
```

```bash
stallion link
# stallion is now available globally
```

### `shortcut`

Create a macOS `.app` bundle at `~/Applications/Stallion.app`. Double-clicking it runs `stallion start` and opens `http://localhost:3000` in the browser.

```
stallion shortcut
```

```bash
stallion shortcut
```

---

## Configuration

### `config`

Show all current configuration values from `~/.stallion-ai/config.json`.

```
stallion config
```

### `config get <key>`

Get a single configuration value.

```
stallion config get <key>
```

```bash
stallion config get registryUrl
stallion config get defaultModel
```

### `config set <key> <value>`

Set a configuration value. Use `"null"` to unset a key.

```
stallion config set <key> <value>
```

```bash
stallion config set registryUrl https://registry.example.com/plugins.json
stallion config set defaultModel us.anthropic.claude-sonnet-4-5-20250929-v1:0
stallion config set registryUrl null
```

### `export --format=<format>`

Export Stallion configuration into an external portability format.

```
stallion export --format=<agents-md|claude-desktop> [--output=<path>]
```

Supported formats:

| Format | Output |
|--------|--------|
| `agents-md` | Stallion-owned `AGENTS.md` export with structured machine block and loss report |
| `claude-desktop` | `claude_desktop_config.json`-style MCP configuration |

```bash
stallion export --format=agents-md --output=./AGENTS.md
stallion export --format=claude-desktop --output=./claude_desktop_config.json
```

### `import <file>`

Import a supported portability file back into Stallion’s canonical config.

```
stallion import <file>
```

Current supported inputs:

| Input | Behavior |
|-------|----------|
| `AGENTS.md` | Restores structured Stallion-owned sections, preserves unmatched prose as notes, records import ledger metadata |
| `claude_desktop_config.json` | Imports MCP server definitions into Stallion integrations |

```bash
stallion import ./AGENTS.md
stallion import ./claude_desktop_config.json
```

---

## Plugin Management

### `install <source>`

Install a plugin from a git URL or local path. Clones/copies the plugin to `~/.stallion-ai/plugins/<name>`, installs npm dependencies, builds the plugin bundle, registers agents and layouts, and copies tool configs.

Dependencies declared in `plugin.json` are resolved and installed automatically.

```
stallion install <source> [--skip=<components>] [--clean]
```

| Argument/Flag | Description |
|---------------|-------------|
| `<source>` | Git URL (https or ssh) or local path. Append `#<branch>` to target a specific branch. |
| `--skip=<components>` | Comma-separated list of components to skip, e.g. `agent:myplugin:chat,layout:main` |
| `--clean` | Wipe `~/.stallion-ai` before installing |

```bash
stallion install https://github.com/org/my-plugin.git
stallion install https://github.com/org/my-plugin.git#develop
stallion install git@github.com:org/my-plugin.git
stallion install ./path/to/local-plugin
stallion install https://github.com/org/plugin.git --skip=agent:plugin:chat
stallion install https://github.com/org/plugin.git --clean
```

### `preview <source>`

Validate a plugin and display its contents without installing it. Shows components, permissions, dependencies, and any conflicts with already-installed plugins.

```
stallion preview <source>
```

```bash
stallion preview https://github.com/org/my-plugin.git
stallion preview ./path/to/local-plugin
```

Output includes suggested `--skip` flags if conflicts are detected.

### `list`

List all installed plugins with their agents, layouts, providers, and dependencies.

```
stallion list
```

```bash
stallion list
```

### `remove <name>`

Remove an installed plugin by its manifest name. Also removes its registered agents and layout.

```
stallion remove <name>
```

```bash
stallion remove my-plugin
```

### `info <name>`

Show details for an installed plugin: version, agents, and layout.

```
stallion info <name>
```

```bash
stallion info my-plugin
```

### `update <name>`

Pull the latest changes for a git-installed plugin (`git pull --ff-only`). Fails if the plugin was installed from a local path.

```
stallion update <name>
```

```bash
stallion update my-plugin
```

### `registry [url]`

Browse available plugins from the configured registry URL, or set the registry URL.

```
stallion registry [url]
stallion registry install <id>
```

Without a URL argument, fetches and displays the registry. The URL is read from `~/.stallion-ai/config.json` (`registryUrl` field).

With a URL argument, saves it to `~/.stallion-ai/config.json` and exits.

```bash
# Set registry URL
stallion registry https://registry.example.com/plugins.json

# Browse registry
stallion registry

# Install from the configured registry
stallion registry install demo-layout
```

---

## Plugin Development

### `init [name]`

Scaffold a new plugin project in the current directory (or a named subdirectory).

```
stallion init [name]
```

```bash
stallion init
stallion init my-plugin
```

`init` is the compatibility alias for the `full` template in `create-plugin`.

### `create-plugin [name]`

Scaffold a new plugin project using a specific template.

```
stallion create-plugin [name] [--template=<full|layout|provider>]
```

| Template | Description |
|----------|-------------|
| `full` | Layout + agent + build config starter |
| `layout` | UI-focused starter with layout manifest and entrypoint |
| `provider` | Server-side starter with `serverModule`, provider files, and request hooks |

```bash
stallion create-plugin my-plugin --template=full
stallion create-plugin my-layout --template=layout
stallion create-plugin my-provider --template=provider
```

### `build`

Build the plugin bundle in the current directory. Outputs to `dist/`.

```
stallion build
```

```bash
stallion build
```

### `dev [port]`

Start a local development server for the plugin in the current directory. Builds the plugin in dev mode, watches `src/` for changes and hot-reloads, and connects to MCP tool servers if configured.

```
stallion dev [port] [--no-mcp] [--mcp] [--tools-dir=<path>]
```

| Argument/Flag | Default | Description |
|---------------|---------|-------------|
| `[port]` | `4200` | Port for the dev server |
| `--no-mcp` | — | Disable MCP tool server connections |
| `--mcp` | — | Explicitly enable MCP (default when agents are present) |
| `--tools-dir=<path>` | `./tools` | Directory containing tool config files |

The dev server exposes:
- `GET /` — plugin UI preview
- `GET /agents/:slug/tools` — list available tools
- `POST /agents/:slug/tools/:toolName` — call a tool via MCP
- `POST /api/plugins/fetch` — server-side fetch proxy (mirrors production API)
- `GET /api/reload` — SSE endpoint for hot reload

```bash
stallion dev
stallion dev 3333
stallion dev --no-mcp
stallion dev 3333 --tools-dir=./my-tools
```

---

## Instance State Mechanism

When `stallion start` launches the server and UI processes, it writes per-instance state to `.stallion/instances/<instance-id>.json` in the current working directory. Each record includes the instance id, home directory, ports, and current server/UI PIDs.

`stallion stop` resolves the matching instance from `--instance`, `--base`, `--port`, or `--ui-port`, then terminates only that instance. If multiple instances are live and the selector is ambiguous, the CLI refuses and prints the matching records so you can choose the intended one.

During rollout, Stallion still recognizes the legacy `<cwd>/.stallion.pids` file when present and migrates away from it as new-format state is written.

---

## Environment Variables

| Variable | Used by | Description |
|----------|---------|-------------|
| `PORT` | `start` | Overridden by `--port=<n>`. Sets the API server listen port. |
| `STALLION_AI_DIR` | lifecycle + server runtime | Base Stallion home. Lifecycle commands also accept `--base=<dir>` and `--temp-home`. |
| `STALLION_INSTANCE_ID` | server runtime | Stable instance identity injected by the CLI for targeted restart/update flows. |
| `STALLION_INSTANCE_STATE_PATH` | server runtime | Path to the per-instance state record that restart/update rewrites in place. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | server runtime | OpenTelemetry collector endpoint for tracing/metrics export. |
| `VITE_API_BASE` | UI build | Base URL for API calls from the UI. Set at build time. |
