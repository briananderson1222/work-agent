# Plugin Integration Simplification

**Date:** 2026-03-06
**Branch:** `refactor/plugin-simplification`
**Goal:** Centralize plugin build logic, eliminate per-plugin boilerplate, extract CLI internals into maintainable modules. Zero functionality changes — same runtime behavior, same plugin contract, same install paths.

---

## Context for Subagents

You're working on **Project Stallion** (`~/dev/gitlab/stallion-workspace/stallion-new`), a local-first AI agent system with a plugin architecture. Plugins provide workspaces (React UI bundles), agents, providers, and tools.

### The Problem

The plugin build contract is duplicated across 5+ locations with slight variations:

| Location | What it does | How |
|---|---|---|
| `../sa-agent/build.mjs` | Builds plugin IIFE bundle | esbuild JS API + banner/footer + externalize plugin |
| `../sa-agent/build.sh` | Builds plugin IIFE bundle | esbuild CLI + `--external:` flags + `--inject:shim.js` + `cat >>` append |
| `../sa-agent/shim.js` | Runtime module resolution | Overrides `globalThis.require` → `window.__stallion_ai_shared` |
| `packages/cli/src/cli.ts` `build()` (L507-631) | Builds plugin IIFE bundle | esbuild CLI + `SHARED_EXTERNALS` array + generates shim + appends registration |
| `packages/cli/src/cli.ts` `devHTML()` (L1045-1170) | Dev preview HTML | 125 lines of inline JS string with SDK mock + another require shim |
| `packages/shared/src/index.ts` `buildPlugin()` | Delegates to build.mjs or build.sh | Just runs `node build.mjs` or `bash build.sh` |
| `scripts/cli-plugin.ts` | Dead code — old plugin manager | 250 lines, fully superseded by CLI |

Additionally, `packages/cli/src/cli.ts` is 1533 lines in a single file.

### Target State

- **Plugin authors need:** `plugin.json` + `src/index.tsx` + `package.json` + `workspace.json`. No build scripts.
- **Build logic lives in:** `@stallion-ai/shared` only. One function, one externals list, one shim.
- **CLI is modular:** Commands in separate files, dev server extracted, SDK mock is TypeScript (not string literals).
- **Both install paths** (CLI `stallion install` and UI `POST /api/plugins/install`) already converge on `buildPlugin()` in shared — we just make that function self-sufficient.

### Key Constraint

`../aws-internal/build.sh` is `npx tsc` (provider-only plugin, no UI bundle). This is a legitimately different build. The centralized `buildPlugin()` must detect workspace plugins (have `entrypoint` in manifest) vs provider-only plugins and handle both.

---

## Dependency Graph

```
Wave 1: @stallion-ai/shared (buildPlugin rewrite)
   │
   ├──→ Wave 2A: sa-agent cleanup (delete build.mjs/build.sh/shim.js)
   ├──→ Wave 2B: CLI command extraction (install, manage, init, lifecycle, build)
   ├──→ Wave 2C: CLI dev extraction (sdk-mock, template, server)
   └──→ Wave 2D: Dead code removal (scripts/cli-plugin.ts)
              │
              └──→ Wave 3: CLI dispatcher rewrite (imports from 2B + 2C)
                      │
                      └──→ Wave 4: Validation (build, install, dev, tests)
```

---

## Wave 1 — Centralize Build in `@stallion-ai/shared`

**Subagent count:** 1 (sequential — everything depends on this)

### Task 1.1: Add build constants and rewrite `buildPlugin()`

**File:** `packages/shared/src/index.ts`

**Add these exports:**

```typescript
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
export const SHARED_EXTERNALS_REGEX = /^react$|^react\/|^@stallion-ai\/sdk$|^@stallion-ai\/components$|^@tanstack\/react-query$|^dompurify$|^debug$|^zod$/;

/** Runtime require() shim injected as esbuild banner — maps externals to window.__stallion_ai_shared */
export const RUNTIME_SHIM = `
var __shared = (typeof window !== 'undefined' && window.__stallion_ai_shared) || {};
var require = globalThis.require = function(m) {
  if (__shared[m]) return __shared[m];
  if (m === 'react' || m === 'react/jsx-runtime' || m === 'react/jsx-dev-runtime') return __shared['react'];
  console.warn('[Plugin] Unknown shared module:', m);
  return {};
};
`;

/** Registration footer — exposes plugin exports on window.__stallion_ai_plugins */
export function registrationFooter(pluginName: string): string {
  return `\nwindow.__stallion_ai_plugins = window.__stallion_ai_plugins || {}; window.__stallion_ai_plugins[${JSON.stringify(pluginName)}] = __plugin;\n`;
}
```

**Rewrite `buildPlugin()`:**

Current behavior: checks for `build.mjs` or `build.sh`, runs it via `execSync`, returns boolean.

New behavior:
1. Read `plugin.json` manifest
2. If manifest has `entrypoint` (workspace plugin) → use esbuild JS API directly with the constants above
3. If no `entrypoint` → fall back to existing behavior (run `build.mjs`, `build.sh`, or `npm run build`)
4. Accept optional `mode: 'production' | 'dev'` parameter for dev builds
5. Return `{ built: boolean; bundlePath?: string; cssPath?: string }` instead of bare boolean

```typescript
export interface BuildResult {
  built: boolean;
  bundlePath?: string;
  cssPath?: string;
}

export async function buildPlugin(pluginDir: string, mode: 'production' | 'dev' = 'production'): Promise<BuildResult> {
  const manifest = readPluginManifest(pluginDir);

  // Workspace plugins with entrypoint: use centralized esbuild build
  if (manifest.entrypoint) {
    return buildWorkspacePlugin(pluginDir, manifest, mode);
  }

  // Provider-only / custom plugins: fall back to existing scripts
  return buildCustomPlugin(pluginDir);
}
```

The `buildWorkspacePlugin()` function uses esbuild's JS API:
- `entryPoints: [join(pluginDir, manifest.entrypoint)]`
- `bundle: true, format: 'iife', globalName: '__plugin'`
- `outfile: join(pluginDir, 'dist', `bundle${mode === 'dev' ? '-dev' : ''}.js`)`
- `jsx: 'automatic'`
- `banner: { js: RUNTIME_SHIM }`
- `footer: { js: registrationFooter(manifest.name) }`
- `define: { 'process.env.NODE_ENV': mode === 'dev' ? '"development"' : '"production"' }`
- `externalize-shared` plugin using `SHARED_EXTERNALS_REGEX`
- Dev mode: `sourcemap: 'inline'`

The `buildCustomPlugin()` function preserves existing behavior for plugins like `aws-internal`:
- Check for `build.mjs` → `node build.mjs`
- Check for `build.sh` → `bash build.sh`
- Check for `package.json` with `build` script → `npm run build`
- Return `{ built: true }` or `{ built: false }`

**Important:** The function signature changes from sync `boolean` to async `Promise<BuildResult>`. All callers must be updated:
- `packages/cli/src/cli.ts` line ~260 (install function)
- `packages/cli/src/cli.ts` line ~507 (build command)
- `src-server/routes/plugins.ts` line ~42 (`buildPlugin` wrapper)
- `packages/shared/src/index.ts` itself (the old sync function)

**esbuild dependency:** The shared package needs esbuild. Add to `packages/shared/package.json`:
```json
"dependencies": { "esbuild": "^0.25.0" }
```

### Acceptance Criteria (Wave 1)
- [ ] `SHARED_EXTERNALS`, `RUNTIME_SHIM`, `registrationFooter()` exported from `@stallion-ai/shared`
- [ ] `buildPlugin()` builds workspace plugins via esbuild JS API (no delegation to build.mjs/build.sh)
- [ ] `buildPlugin()` falls back to custom scripts for non-workspace plugins
- [ ] `buildPlugin()` supports `mode: 'dev'` for dev builds
- [ ] All callers updated for async `Promise<BuildResult>` return type
- [ ] `npm run build:server` succeeds (TypeScript compiles)

---

## Wave 2 — Parallel Extraction (4 subagents)

All Wave 2 tasks are independent. No file overlaps between subagents.

### Wave 2A: Clean up sa-agent plugin

**Subagent A — Files touched:** `../sa-agent/` only

| Action | File |
|---|---|
| DELETE | `../sa-agent/build.mjs` |
| DELETE | `../sa-agent/build.sh` |
| DELETE | `../sa-agent/shim.js` |
| MODIFY | `../sa-agent/package.json` — change `"build"` script to `"stallion build"`, remove `esbuild` from devDependencies |

**Verify:** `cd ../sa-agent && npx stallion build` produces `dist/bundle.js` using the shared `buildPlugin()`.

### Wave 2B: Extract CLI commands

**Subagent B — Files created/modified:** `packages/cli/src/commands/` only (new directory)

Extract functions from `cli.ts` into focused modules. Each module exports named functions — no classes.

| New File | Functions Extracted | Source Lines |
|---|---|---|
| `commands/helpers.ts` | `readManifest`, `isGitUrl`, `parseGitSource`, `extractPluginName`, `lookupDepInRegistries` | L65-118 |
| `commands/install.ts` | `install`, `preview`, `list`, `remove`, `info`, `update`, `registry` | L120-470 |
| `commands/build.ts` | `build` (rewritten to call `buildPlugin()` from shared) | L507-631 → ~20 lines |
| `commands/init.ts` | `init` | L633-730 |
| `commands/lifecycle.ts` | `isRunning`, `isInstalled`, `start`, `stop`, `doctor`, `link`, `shortcut`, `clean`, `upgrade` | L1173-1410 |

**Key changes in `commands/build.ts`:**
- Instead of reimplementing esbuild invocation, call `buildPlugin(CWD, mode)` from `@stallion-ai/shared`
- The `findEsbuild()`, `ensureShim()`, and `SHARED_EXTERNALS` constant are no longer needed in CLI
- Dev mode: `buildPlugin(CWD, 'dev')`

**Key changes in `commands/install.ts`:**
- Import helpers from `./helpers.ts`
- Import `buildPlugin` from `@stallion-ai/shared` (already does via `buildPluginBundle`)
- No logic changes — just extraction

**Shared state:** `PROJECT_HOME`, `PLUGINS_DIR`, `AGENTS_DIR`, `WORKSPACES_DIR`, `CWD`, `PIDFILE` move to `commands/helpers.ts` as exported constants.

### Wave 2C: Extract CLI dev server

**Subagent C — Files created:** `packages/cli/src/dev/` only (new directory)

| New File | Content | Source Lines |
|---|---|---|
| `dev/sdk-mock.ts` | SDK mock as a TypeScript object with `serialize()` method | Extracted from devHTML L1097-1165 |
| `dev/template.ts` | `generateDevHTML(opts)` — HTML template with injection points | Extracted from devHTML L1045-1170 |
| `dev/server.ts` | `startDevServer(port, flags)` — HTTP server, SSE reload, MCP setup | Extracted from dev() L746-1043 |

**`dev/sdk-mock.ts` design:**

```typescript
/** SDK mock configuration — each hook/function as a named entry */
export interface SDKMockConfig {
  wsSlug: string;
  pluginName: string;
}

/** Generate the SDK mock JS string from structured config */
export function serializeSDKMock(config: SDKMockConfig): string {
  // Build the mock object from typed entries instead of string concatenation
  // Each hook is a separate function that gets serialized
}
```

The key improvement: each SDK hook mock is a separate TypeScript function that gets `.toString()`'d or template-literal'd into the HTML. This means:
- Type checking catches mock signature drift
- Adding a new SDK hook = adding one function, not editing a string blob
- The mock is testable in isolation

**`dev/template.ts` design:**

```typescript
export interface DevTemplateOptions {
  name: string;
  pluginName: string;
  tabsJson: string;
  agentInfo: string;
  wsSlug: string;
  sdkMockJs: string;  // from serializeSDKMock()
}

export function generateDevHTML(opts: DevTemplateOptions): string {
  // Clean template with ${} injection points
  // CSS stays inline (it's small and self-contained)
}
```

**`dev/server.ts` design:**

```typescript
export interface DevFlags {
  mcp?: boolean;
  toolsDir?: string;
}

export function startDevServer(port: number, flags: DevFlags): void {
  // Calls buildPlugin(CWD, 'dev') from shared
  // HTTP server, SSE reload, MCP setup, static file serving
  // Uses generateDevHTML() from template.ts
}
```

### Wave 2D: Delete dead code

**Subagent D — Files deleted:**

| Action | File | Reason |
|---|---|---|
| DELETE | `scripts/cli-plugin.ts` | Old class-based PluginManager, fully superseded by `packages/cli/src/cli.ts` |

**Verify:** `grep -r "cli-plugin" .` returns no references.

---

## Wave 3 — CLI Dispatcher Rewrite

**Subagent count:** 1 (depends on Wave 2B + 2C)

### Task 3.1: Rewrite `packages/cli/src/cli.ts` as dispatcher

**File:** `packages/cli/src/cli.ts`

Replace the entire 1533-line file with a ~60-line dispatcher:

```typescript
#!/usr/bin/env tsx
import { CWD } from './commands/helpers.js';
import { install, preview, list, remove, info, update, registry } from './commands/install.js';
import { build } from './commands/build.js';
import { init } from './commands/init.js';
import { start, stop, upgrade, doctor, link, shortcut, clean, isRunning } from './commands/lifecycle.js';
import { startDevServer } from './dev/server.js';

const [,, command, ...args] = process.argv;

try {
  switch (command) {
    case 'install': { /* parse args, call install() */ break; }
    case 'preview': preview(args[0]); break;
    case 'list': list(); break;
    // ... etc
    default: printUsage();
  }
} catch (err: any) {
  console.error('Error:', err.message);
  process.exit(1);
}
```

The switch/case logic from L1414-1533 moves here with imports from the extracted modules.

### Acceptance Criteria (Wave 3)
- [ ] `cli.ts` is under 100 lines
- [ ] All CLI commands work identically to before
- [ ] `stallion --help` prints the same usage text

---

## Wave 4 — Validation

**Subagent count:** 1 (sequential, after everything)

### Task 4.1: Build validation
```bash
cd ~/dev/gitlab/stallion-workspace/stallion-new
npm run build:server   # TypeScript compiles
```

### Task 4.2: Plugin build validation
```bash
cd ~/dev/gitlab/stallion-workspace/sa-agent
npx stallion build     # Produces dist/bundle.js
# Compare bundle size to previous (should be similar)
```

### Task 4.3: Plugin install validation (CLI path)
```bash
cd ~/dev/gitlab/stallion-workspace/stallion-new
npx stallion install ../sa-agent
npx stallion install ../aws-internal
npx stallion list      # Both show up
```

### Task 4.4: Dev server validation
```bash
cd ~/dev/gitlab/stallion-workspace/sa-agent
npx stallion dev       # Starts on :4200, hot reload works
```

### Task 4.5: Playwright tests
```bash
cd ~/dev/gitlab/stallion-workspace/stallion-new
npx playwright test tests/plugin-system.spec.ts
npx playwright test tests/plugin-preview.spec.ts
```

### Acceptance Criteria (Wave 4)
- [ ] Server builds without errors
- [ ] sa-agent builds without build.mjs/build.sh/shim.js
- [ ] aws-internal builds with its own build.sh (npx tsc)
- [ ] CLI install works for both plugin types
- [ ] Dev server starts and serves workspace tabs
- [ ] Existing Playwright plugin tests pass

---

## File Change Summary

### Files Created (9)
| File | Wave | Subagent |
|---|---|---|
| `packages/cli/src/commands/helpers.ts` | 2B | B |
| `packages/cli/src/commands/install.ts` | 2B | B |
| `packages/cli/src/commands/build.ts` | 2B | B |
| `packages/cli/src/commands/init.ts` | 2B | B |
| `packages/cli/src/commands/lifecycle.ts` | 2B | B |
| `packages/cli/src/dev/sdk-mock.ts` | 2C | C |
| `packages/cli/src/dev/template.ts` | 2C | C |
| `packages/cli/src/dev/server.ts` | 2C | C |

### Files Modified (4)
| File | Wave | Subagent | Change |
|---|---|---|---|
| `packages/shared/src/index.ts` | 1 | — | Add constants, rewrite `buildPlugin()` |
| `packages/shared/package.json` | 1 | — | Add esbuild dependency |
| `src-server/routes/plugins.ts` | 1 | — | Update `buildPlugin` call for async return |
| `packages/cli/src/cli.ts` | 3 | — | Replace with dispatcher |
| `../sa-agent/package.json` | 2A | A | Update build script, remove esbuild devDep |

### Files Deleted (4)
| File | Wave | Subagent |
|---|---|---|
| `../sa-agent/build.mjs` | 2A | A |
| `../sa-agent/build.sh` | 2A | A |
| `../sa-agent/shim.js` | 2A | A |
| `scripts/cli-plugin.ts` | 2D | D |

---

## Subagent Assignment Summary

| Wave | Subagent | Scope | Files Touched | Estimated Size |
|---|---|---|---|---|
| 1 | Single | `packages/shared/`, `src-server/routes/plugins.ts` | 3 modified | Medium |
| 2A | A | `../sa-agent/` | 3 deleted, 1 modified | Small |
| 2B | B | `packages/cli/src/commands/` | 5 created | Large |
| 2C | C | `packages/cli/src/dev/` | 3 created | Large |
| 2D | D | `scripts/` | 1 deleted | Trivial |
| 3 | Single | `packages/cli/src/cli.ts` | 1 modified | Medium |
| 4 | Single | Validation only | 0 | Medium |

**Max parallelism:** 4 subagents in Wave 2 (A, B, C, D)
