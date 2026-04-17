# Plan 04: UX & Frontend Polish

> **Goal:** Make every user-facing surface clear, consistent, and accurate.
> No jargon, no raw internal values, no misleading defaults. Every message
> should tell the user what they need to know in language they actually use.
>
> **Depends on:**
> - [Plan 01 — Connected Agents Overhaul](./01-connected-agents-overhaul.md)
> - [Plan 03 — Connections Runtime UX](./03-connections-runtime-ux.md)
>
> **Scope:** Copy, labels, hierarchy, empty states, status language, and
> structural UX. Does NOT include new features, visual redesign, or
> backend changes.

---

## Table of Contents

1. [Goal and Principles](#1-goal-and-principles)
2. [Shared Label Utilities](#2-shared-label-utilities)
3. [ConnectionsHub](#3-connectionshub)
4. [RuntimeConnectionView](#4-runtimeconnectionview)
5. [ProviderSettingsView (Model Connections)](#5-providersettingsview-model-connections)
6. [AgentEditorForm — Execution Section](#6-agenteditorform--execution-section)
7. [AgentsView — List Subtitles](#7-agentsview--list-subtitles)
8. [ChatSettingsPanel](#8-chatsettingspanel)
9. [OnboardingGate / SetupBanner](#9-onboardinggate--setupbanner)
10. [Execution Utils](#10-execution-utils)
11. [Implementation Order](#11-implementation-order)
12. [Acceptance Criteria](#12-acceptance-criteria)

---

## 1. Goal and Principles

### North Star

A user who has never read the codebase should be able to:

1. Open **Connections** and immediately understand what each item is, whether
   it is ready, and what to do if it is not.
2. Open an **agent** and understand which AI engine it uses and how to change
   that.
3. Glance at **Chat** and see the session execution state in plain language.
4. Encounter any error, warning, or status message and know what it means
   without Googling.

### Principles

1. **No raw internal identifiers in UI copy.**
   `bedrock-runtime`, `claude-runtime`, `missing_prerequisites`, `acp` are
   implementation strings. Never render them directly. Always map to a
   user-facing label.

2. **Status language uses verbs or outcomes, not technical enum values.**
   - `missing` → `Not found` or `Not installed`
   - `installed` → `Installed` or `✓`
   - `ready` → `Ready`
   - `missing_prerequisites` → `Setup required`
   - `degraded` → `Degraded`
   - `error` → `Error`
   - `disabled` → `Disabled`

3. **Fallbacks must be honest.**
   If there is no data, show `—` or `No active session`. Do not silently
   show a default value that may be wrong.

4. **Help text guides action, not implementation.**
   Instead of "this field is projected from registered adapters", say
   "To change this, edit the agent's Execution settings."

5. **Hierarchy is clear.**
   - Connections = where you configure external backends
   - Agents = where you assign execution behavior
   - Chat = where you see session state (read-only)
   This hierarchy must be reflected in every description and hint.

6. **Terminology is consistent across all surfaces.**
   Use these terms everywhere, no synonyms:
   - **Connection** — a configured external backend
   - **Model Connection** — a raw LLM/embedding backend (Bedrock, Ollama,
     OpenAI-compatible)
   - **Runtime Connection** — a full agent execution engine (Claude, Codex,
     Bedrock Runtime, ACP)
   - **Execution** — the resolved runtime + model configuration for a session
   Never use: provider, adapter, orchestration provider, runtime adapter,
   projected from, registered adapters (in user-facing text)

---

## 2. Shared Label Utilities

**File:** `src-ui/src/utils/execution.ts`

All label mapping lives here. Other files import from this module.

### 2.1 `connectionTypeLabel(type: string): string`

Maps raw connection type identifiers to display names.

```ts
export function connectionTypeLabel(type: string): string {
  switch (type) {
    case 'bedrock':         return 'Amazon Bedrock';
    case 'ollama':          return 'Ollama';
    case 'openai-compat':   return 'OpenAI-Compatible';
    case 'bedrock-runtime': return 'Bedrock';
    case 'claude-runtime':  return 'Claude';
    case 'codex-runtime':   return 'Codex';
    case 'acp':             return 'ACP';
    default:                return type;
  }
}
```

### 2.2 `connectionStatusLabel(status: string): string`

Maps raw status values to user-facing labels.

```ts
export function connectionStatusLabel(status: string): string {
  switch (status) {
    case 'ready':                  return 'Ready';
    case 'degraded':               return 'Degraded';
    case 'missing_prerequisites':  return 'Setup required';
    case 'disabled':               return 'Disabled';
    case 'error':                  return 'Error';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
  }
}
```

### 2.3 `prerequisiteStatusLabel(status: string): string`

Maps prerequisite item status to readable text.

```ts
export function prerequisiteStatusLabel(status: string): string {
  switch (status) {
    case 'installed': return 'Installed';
    case 'missing':   return 'Not found';
    case 'warning':   return 'Check required';
    default:          return status;
  }
}
```

### 2.4 `prerequisiteCategoryLabel(category: string): string`

```ts
export function prerequisiteCategoryLabel(category: string): string {
  switch (category) {
    case 'required': return 'Required';
    case 'optional': return 'Optional';
    default:         return category;
  }
}
```

### 2.5 Fix `providerLabel()`

Current behavior returns `'Bedrock Runtime'` when called with no args —
a misleading default.

Target behavior:

```ts
export function providerLabel(provider?: ProviderKind | null): string {
  if (provider === 'claude') return 'Claude';
  if (provider === 'codex')  return 'Codex';
  if (provider === 'bedrock') return 'Bedrock';
  return '';
}
```

Callers that use the empty-string result must handle it explicitly
(show `—` or `No active session`).

### 2.6 Fix `runtimeConnectionLabel()`

Current returns e.g. `'Claude Runtime'` — redundant "Runtime" suffix.

```ts
export function runtimeConnectionLabel(
  runtimeConnectionId?: string | null,
): string {
  return connectionTypeLabel(runtimeConnectionId ?? '');
}
```

This delegates to the canonical mapping above.

### 2.7 Fix `executionStatusLabel()`

Current does not handle all known statuses.

```ts
export function executionStatusLabel(status?: string | null): string {
  if (!status) return 'Not started';
  return connectionStatusLabel(status);
}
```

### 2.8 Fix `formatExecutionSummary()`

Used in the agents list as the item subtitle.

Current: `"Bedrock Runtime · model-id"` — "Runtime" suffix is noise.

Target: `"Bedrock · model-id"` (or just `"Claude"` if no model).

```ts
export function formatExecutionSummary(agent: AgentWithExecution): string {
  const runtime = runtimeConnectionLabel(agent.execution?.runtimeConnectionId);
  const model = agent.execution?.modelId || agent.model;
  return model ? `${runtime} · ${model}` : runtime;
}
```

This works because `runtimeConnectionLabel` now returns `'Bedrock'` not
`'Bedrock Runtime'`.

---

## 3. ConnectionsHub

**File:** `src-ui/src/views/ConnectionsHub.tsx`

### 3.1 Section descriptions

Add a one-line `<p>` description below each section heading.

| Section | Description |
|---------|-------------|
| Model Connections | Raw LLM and embedding backends |
| Runtime Connections | AI engines that run your agents |
| Knowledge | Vector database and embeddings for search |
| Tool Servers | MCP and external tool integrations |

### 3.2 Card type display

Cards currently show `p.type` raw (e.g. `bedrock`, `claude-runtime`).

Replace with `connectionTypeLabel(p.type)` everywhere a type string is
displayed on a card.

### 3.3 `describeConnection()` — fix prerequisite language

Current output for a connection with missing prerequisites:
```
ANTHROPIC_API_KEY missing
```

Problems:
- `missing` is a raw status enum
- Multiple prerequisites concatenated with ` · ` but joined with raw status
  on each

Target:
- Each item: `"{name} — {prerequisiteStatusLabel(status)}"`
- Multiple items joined with `" · "`
- If all prerequisites met and it's ACP: `"{connected}/{configured} active"`
- If all prerequisites met otherwise: empty string (let the card type speak)

```ts
function describeConnection(connection: Connection): string {
  const missing = connection.prerequisites.filter(
    (item) => item.status !== 'installed',
  );
  if (missing.length > 0) {
    return missing
      .map((item) => `${item.name} — ${prerequisiteStatusLabel(item.status)}`)
      .join(' · ');
  }
  if (connection.type === 'acp') {
    const configured = Number(connection.config.configuredCount || 0);
    const connected  = Number(connection.config.connectedCount  || 0);
    return `${connected} of ${configured} active`;
  }
  return '';
}
```

### 3.4 Status dot — add text label

Status dots (`●`) currently have no associated label. Users cannot tell what
green/yellow means.

Replace the bare dot with a labeled badge:

```tsx
<span className={`connections-hub__status-badge connections-hub__status-badge--${statusClass}`}>
  {connectionStatusLabel(connection.status)}
</span>
```

Where `statusClass` maps `ready → ready`, `missing_prerequisites → warn`,
`error → error`, `disabled → disabled`.

Add corresponding CSS classes in `ConnectionsHub.css`.

### 3.5 Runtime Connections section — empty state

When no runtime connections are returned, show:

```
No runtime connections available.
Runtimes appear here automatically when supported AI engines are detected.
```

(Do not show an add button — runtimes are registered, not manually created.)

### 3.6 Model Connections empty-state button text

Current: `+ Add a model provider to get started`
Target: `+ Add a model connection`

---

## 4. RuntimeConnectionView

**File:** `src-ui/src/views/RuntimeConnectionView.tsx`

### 4.1 List item subtitle

Current: `"Missing prerequisites · bedrock-runtime"`

Target: `"{connectionStatusLabel(status)} · {connectionTypeLabel(type)}"`

```ts
subtitle: `${connectionStatusLabel(connection.status)} · ${connectionTypeLabel(connection.type)}`,
```

### 4.2 Page subtitle

Current: `"Inspect runtime readiness and test provider-native adapters"`

Target: `"Check readiness and test your AI runtimes"`

### 4.3 Detail pane — Type field

Current: Shows raw `runtime.type` value.
Target: `connectionTypeLabel(runtime.type)`

The badge in `DetailHeader` also shows `runtime.type` raw.
Target: `connectionTypeLabel(runtime.type)` in the badge label too.

### 4.4 Detail pane — Status field

Current: `statusLabel(runtime.status)` which is a local helper with a custom
mapping for `missing_prerequisites`.

Target: Replace with `connectionStatusLabel(runtime.status)` from the shared
utility. Delete the local `statusLabel` helper.

### 4.5 Capability chips

Current: `capability.replaceAll('-', ' ')`
Target: Use a proper label map.

```ts
export function capabilityLabel(capability: string): string {
  const map: Record<string, string> = {
    'llm':              'Language model',
    'embedding':        'Embeddings',
    'agent-runtime':    'Agent runtime',
    'session-lifecycle':'Session lifecycle',
    'tool-calls':       'Tool calls',
    'interrupt':        'Interrupt',
    'approvals':        'Approvals',
    'resume':           'Resume',
    'reasoning-events': 'Reasoning',
    'external-process': 'External process',
    'acp':              'ACP',
    'vectordb':         'Vector database',
  };
  return map[capability] ?? capability.replace(/-/g, ' ');
}
```

Add this to `execution.ts` or a new `src-ui/src/utils/labels.ts`.

### 4.6 Prerequisite list — fix chip labels

Current: shows raw `item.status` and `item.category` as chips.

Target: use `prerequisiteStatusLabel(item.status)` and
`prerequisiteCategoryLabel(item.category)`.

Also style the status chip with a color: green for installed, amber for
warning, red for missing. CSS classes: `plugins__cap--ok`, `plugins__cap--warn`,
`plugins__cap--error`.

### 4.7 Configuration section — replace developer jargon

Current:
> Runtime connections are currently projected from registered adapters and
> are read-only in this surface. Configure runtime behavior in adapter setup
> and assign execution targets from Agents.

Target:
> This runtime is detected automatically. To use it, open an agent and set
> it in the Execution section.

### 4.8 Empty pane state

Current: `"Select a runtime connection to inspect readiness and run a health check."`

This is fine — keep it. But ensure it only appears when the list has items.
If the list is empty the empty list state (section 3.5) covers it.

---

## 5. ProviderSettingsView (Model Connections)

**File:** `src-ui/src/views/ProviderSettingsView.tsx`

### 5.1 Page title and subtitle

Current: `title="Model Connections"`, `subtitle="Manage LLM and embedding backends"`

Subtitle target: `"Configure the model backends your agents use"`

### 5.2 Type picker title / description

Current: `"Add Provider"` / `"Choose a provider type to configure"`

Target: `"Add Model Connection"` / `"Choose the type of backend to add"`

### 5.3 Stack overview panel title

Current: `"Provider Status"`

Target: `"Model Connection Status"`

### 5.4 Stack overview panel — empty state

Current: `"No LLM provider configured"`

Target: `"No language model connection configured"`

Current: `"No embedding provider — needed for knowledge search"`

Target: `"No embedding connection — required for knowledge search"`

### 5.5 Quick Setup section

Current: `"Add a provider to get started"`

Target: `"Add a model connection to get started"`

### 5.6 List item subtitle

Current: `"LLM · EMBEDDING · bedrock"` — raw caps capabilities + raw type

Target: Use friendly capability labels + `connectionTypeLabel(p.type)`.

The caps-uppercase style for capabilities is fine as badges, but the raw type
appended with ` · ` at the end should use `connectionTypeLabel`.

```ts
subtitle:
  p.capabilities
    .filter((c) => c !== 'vectordb')
    .map((c) => c.toUpperCase())
    .join(' · ') +
  (p.type ? ` · ${connectionTypeLabel(p.type)}` : ''),
```

### 5.7 Detail form — Type select options

Current options:
- `Ollama`
- `OpenAI-Compatible`
- `Bedrock`

These are fine. Ensure the select values stay as raw type strings; only the
displayed option text should be human-friendly. Already mostly OK here.

### 5.8 Detail form — Capabilities display

Current: raw caps chips (`LLM`, `EMBEDDING`).

These are technical but readable. Leave them as-is; they serve a power-user
audience who is configuring backends.

### 5.9 "Test Connection" feedback

Current success: `✓ Connection healthy`
Current failure: `✗ Connection failed`

These are fine. No change needed.

---

## 6. AgentEditorForm — Execution Section

**File:** `src-ui/src/views/AgentEditorForm.tsx`

### 6.1 Add a visual section header

The execution fields (Runtime Connection, Model Connection, Model ID, runtime
options) currently appear inline in the form with no visual grouping or
orientation. A user scanning the form has no idea why these fields are there.

Add a section divider before these fields:

```tsx
<div className="agent-editor__section-header">
  <h4 className="agent-editor__section-title">Execution</h4>
  <p className="agent-editor__section-desc">
    Which AI engine powers this agent and how it runs.
    To inspect or test the runtime, visit{' '}
    <button type="button" className="editor-link" onClick={() => onNavigate({ type: 'connections' })}>
      Connections
    </button>.
  </p>
</div>
```

### 6.2 Runtime Connection label and hint

Current label: `"Runtime Connection"`

Current hint: falls back to `runtimeConnectionLabel(selectedRuntimeId)` which
now returns the friendly name. OK.

But if the selected runtime has a `description`, show that as the hint.
If not, show a context-appropriate hint:

| Runtime | Hint |
|---------|------|
| Bedrock | Runs via AWS Bedrock. Requires a configured Model Connection. |
| Claude  | Runs via the Claude Agent SDK. Requires ANTHROPIC_API_KEY. |
| Codex   | Runs via the Codex CLI. Requires Codex installed and OPENAI_API_KEY. |
| ACP     | Delegates to an external agent runtime via ACP. |

The dropdown itself shows `connection.name` from the API — that is correct.

### 6.3 Model Connection — only show for Bedrock

Current: `needsModelConnection = selectedRuntimeId === 'bedrock-runtime'` — correct.

Label: `"Model Connection"` — fine.

Hint: `"Use a specific model backend for this agent, or inherit the app default."`

Target hint: `"Which Bedrock connection to use. Leave blank to use the app default."`

### 6.4 Model ID — context-aware placeholder

Current placeholder: `"Model ID for this runtime"` — too vague.

Target: vary by runtime:

| Runtime | Placeholder |
|---------|-------------|
| Claude  | `e.g. claude-opus-4-6` |
| Codex   | `e.g. codex-mini` |
| Bedrock | `e.g. anthropic.claude-3-5-sonnet-20241022-v2:0` |
| default | `Model ID (leave blank for runtime default)` |

The label `"Model ID"` is fine.

Add a hint below this field: `"Leave blank to use the runtime's default model."`

### 6.5 Claude-specific fields

**"Claude Thinking" → "Extended Thinking"**

Users know this as "Extended Thinking" from Anthropic's documentation.

Label: `"Extended Thinking"`
Checkbox text: `"Enable by default"`
Add hint: `"Allows the model to reason step-by-step before responding."`

**"Claude Effort" → "Thinking Budget"**

"Claude Effort" is not a term from any user-facing Anthropic product.

Label: `"Thinking Budget"`
Options:
- `low` → `Low`
- `medium` → `Medium`
- `high` → `High`
- `max` → `Maximum`

Add hint: `"Controls how much reasoning the model does. Higher = more thorough, slower, costlier."`

### 6.6 Codex-specific fields

**"Codex Reasoning Effort" → "Reasoning Effort"**

Label: `"Reasoning Effort"`
Options:
- `low` → `Low`
- `medium` → `Medium`
- `high` → `High`
- `xhigh` → `Highest`  ← fix raw enum label

Add hint: `"How deeply Codex reasons before responding."`

**"Codex Fast Mode"** (if present):
Label: `"Fast Mode"`
Hint: `"Trades reasoning depth for faster responses."`

### 6.7 ACP — hint

When ACP is selected and there is no model connection or model ID field:
Add a hint under the Runtime Connection selector:
`"This agent runs via an external ACP runtime. No local model configuration needed."`

---

## 7. AgentsView — List Subtitles

**File:** `src-ui/src/views/AgentsView.tsx`

### 7.1 Agent list item subtitle

Current: `"${a.slug} · ${formatExecutionSummary(a)}"`

The slug is a technical identifier. Most users don't care about it in a
list scan. The execution summary is more useful.

Target: `formatExecutionSummary(a)` only (slug visible in the detail pane).

If `formatExecutionSummary` returns an empty string (e.g. no execution config),
fall back to `a.slug`.

### 7.2 ACP agent entry subtitle

Current: `"${(c.modes || []).length} agents · ACP"`

Target: `"${count} agent${count === 1 ? '' : 's'} · ACP"` (same, just
ensure pluralization is correct — it already is in the current code but
verify on save).

---

## 8. ChatSettingsPanel

**File:** `src-ui/src/components/ChatSettingsPanel.tsx`

### 8.1 Section label

Current: `"Execution"`

This label is fine.

### 8.2 Active value display

Current: `{activeProviderLabel || providerLabel()}`

`providerLabel()` with no arg currently returns `'Bedrock Runtime'` — wrong
fallback.

After the fix in section 2.5, `providerLabel()` returns `''`. The component
must handle the empty case:

```tsx
<span className="chat-settings-modal__value">
  {activeProviderLabel || '—'}
</span>
```

### 8.3 Model hint

Current:
```
{activeModel ? `Model: ${activeModel}` : 'Model: app default'}
{activeSessionStatus ? ` · Session: ${executionStatusLabel(activeSessionStatus)}` : ''}
```

Target:
- Show `Model: {activeModel}` or `Model: app default` — fine.
- Show `Session: {executionStatusLabel(activeSessionStatus)}` — use updated
  `executionStatusLabel` from section 2.7.
- If both are absent: `"No active session"`

```tsx
<p className="chat-settings-modal__hint">
  {activeModel
    ? `Model: ${activeModel}`
    : activeProviderLabel
    ? 'Model: app default'
    : 'No active session'}
  {activeSessionStatus
    ? ` · ${executionStatusLabel(activeSessionStatus)}`
    : ''}
</p>
```

### 8.4 Jargon hint

Current:
> Execution is configured on the agent and rendered here from session state.

Target:
> To change execution settings, edit the agent in the Agents view.

---

## 9. OnboardingGate / SetupBanner

**File:** `src-ui/src/components/OnboardingGate.tsx`

### 9.1 SetupBanner title

Current: `"No provider is configured yet"`

"Provider" is the old term. Target: `"No AI connection configured yet"`

### 9.2 SetupBanner body

Current:
> Setup is no longer blocking. You can keep using the app and open connections
> when you want to wire Bedrock, Claude, Codex, or ACP.

This is actually pretty good — names the real products. Small improvement:

Target:
> You can use the app now. When you're ready, open Connections to set up
> Bedrock, Claude, Codex, or ACP.

### 9.3 FullScreenError — server not reachable

Current `description`:
> Could not connect to {apiBase}. If connecting from another device, use your
> server's IP address instead of localhost.

This is fine — no change needed.

### 9.4 ReconnectBanner

Current: `"Lost connection to {serverName}. The app is still usable; changes may not save."`

This is clear and honest. No change needed.

---

## 10. Execution Utils

**File:** `src-ui/src/utils/execution.ts`

Full diff summary of all changes:

| Function | Change |
|----------|--------|
| `providerLabel()` | Return `''` when no arg, not `'Bedrock Runtime'` |
| `runtimeConnectionLabel()` | Delegate to `connectionTypeLabel()`, drop "Runtime" suffix |
| `executionStatusLabel()` | Delegate to `connectionStatusLabel()` |
| `formatExecutionSummary()` | Already works once label helpers are fixed |
| **new** `connectionTypeLabel()` | Maps raw type to display name |
| **new** `connectionStatusLabel()` | Maps raw status to display string |
| **new** `prerequisiteStatusLabel()` | Maps raw prereq status |
| **new** `prerequisiteCategoryLabel()` | Maps raw prereq category |
| **new** `capabilityLabel()` | Maps raw capability string |

All existing functions that had internal callers should be updated to use
the new canonical helpers.

---

## 11. Implementation Order

Execute in this order to minimize back-and-forth:

1. **`execution.ts` — add all new helpers, fix existing ones**
   All UI files depend on these. Do this first. Run `npx tsc --noEmit` after.

2. **`ConnectionsHub.tsx` — apply all section 3 changes**
   Most visible surface. Depends only on label helpers.

3. **`RuntimeConnectionView.tsx` — apply all section 4 changes**
   Depends on label helpers.

4. **`ProviderSettingsView.tsx` — apply all section 5 changes**
   Mostly copy changes, some use of `connectionTypeLabel`.

5. **`AgentEditorForm.tsx` — apply all section 6 changes**
   Section header, field labels, hints, option labels. Depends on label
   helpers for hints.

6. **`AgentsView.tsx` — apply section 7 subtitle change**
   One-liner after label helpers are in place.

7. **`ChatSettingsPanel.tsx` — apply section 8 changes**
   Depends on fixed `providerLabel()` and `executionStatusLabel()`.

8. **`OnboardingGate.tsx` — apply section 9 copy changes**
   Standalone, no dependencies.

9. **Run full quality gate:**
   ```bash
   npx biome check src-server/ src-ui/ packages/
   npx tsc --noEmit
   npm test
   ```

10. **Manual smoke test checklist:**
    - [ ] ConnectionsHub: all cards show friendly names and status labels
    - [ ] Runtime connection cards: prerequisites described in plain language
    - [ ] Agent editor: Execution section has header and context-appropriate hints
    - [ ] Agents list: subtitles show execution summary without "Runtime" noise
    - [ ] Chat Settings: Execution section shows `—` when no session, not
          "Bedrock Runtime"
    - [ ] Setup banner: reads "No AI connection configured yet"

---

## 12. Acceptance Criteria

This plan is complete when:

1. No user-facing string contains: `bedrock-runtime`, `claude-runtime`,
   `codex-runtime`, `openai-compat`, `missing_prerequisites`, `agent-runtime`,
   or any raw capability/status enum value.

2. Every status indicator has a readable text label alongside it.

3. Help text in every form field guides users toward action, not toward
   implementation details.

4. The Execution section in the agent editor has a visible section header
   with a one-line description.

5. `ChatSettingsPanel` shows `—` or `"No active session"` when there is no
   active execution context — not a default runtime name.

6. `providerLabel()` called with no argument returns `''` (not `'Bedrock Runtime'`).

7. All quality gates pass:
   - `npx biome check src-server/ src-ui/ packages/`
   - `npx tsc --noEmit`
   - `npm test`
