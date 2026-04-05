# Plan 02: Connected Agents Hardening & Verification

> **Goal:** Move the Connected Agents Overhaul from "feature-complete" to
> "release-hardened" by adding deterministic verification for every critical
> integration boundary: provider adapters, orchestration routes, persistence,
> recovery, SSE delivery, and UI behavior.
>
> **Depends on:** [Plan 01 — Connected Agents Overhaul](./01-connected-agents-overhaul.md)
>
> **Verification standard:** In software, literal mathematical 100% certainty
> is not achievable across all environments. For this repo, "100% verified"
> means **100% of the agreed acceptance checks in this plan pass** in local CI,
> targeted e2e coverage, and manual smoke verification on a real running app.

---

## Table of Contents

1. [Why This Plan Exists](#1-why-this-plan-exists)
2. [What Must Be Proven](#2-what-must-be-proven)
3. [Current Gaps](#3-current-gaps)
4. [Phase 0 — Baseline and Audit](#phase-0--baseline-and-audit)
5. [Phase 1 — Adapter Contract Hardening](#phase-1--adapter-contract-hardening)
6. [Phase 2 — Orchestration and Persistence Proofs](#phase-2--orchestration-and-persistence-proofs)
7. [Phase 3 — UI and SSE End-to-End Coverage](#phase-3--ui-and-sse-end-to-end-coverage)
8. [Phase 4 — Real Runtime Smoke Matrix](#phase-4--real-runtime-smoke-matrix)
9. [Phase 5 — Release Gate and Regression Workflow](#phase-5--release-gate-and-regression-workflow)
10. [Verification Matrix](#verification-matrix)
11. [File Index](#file-index)
12. [Decision Log](#decision-log)

---

## 1. Why This Plan Exists

Plan 01 delivered the architecture and implementation. What it does **not**
fully guarantee is that every connected-agents path keeps working as the code
changes:

- Adapter event mapping can drift from native SDK/JSON-RPC behavior.
- Orchestration can compile while still failing to persist, recover, or stream
  correctly.
- UI provider selection can render correctly while the actual session flow is
  broken.
- Cross-provider parity can regress if one provider gains features and the
  others silently fall behind.

This plan closes that gap.

---

## 2. What Must Be Proven

For Bedrock, Claude, and Codex, we must prove all of the following:

1. A session can be started through the shared orchestration surface.
2. A turn can be sent and streamed as canonical events.
3. Tool activity and approval requests flow through the same canonical event
   pipeline.
4. Events are persisted to the event store.
5. Recoverable session state survives restart and can resume or fail closed.
6. The UI renders the conversation and provider controls correctly.
7. Prerequisites and error states are surfaced clearly.
8. The full local quality gate passes before the work is considered done.

---

## 3. Current Gaps

Based on the current codebase and tests:

- We now have focused contract tests for Bedrock, Claude, and Codex adapters.
- We now have orchestration service, event-store, and SSE route proofs for
  lifecycle, persistence, recovery, and streaming delivery.
- We now have Playwright coverage for provider controls, chat flow, and
  recovery behavior.
- We still do **not** have recorded live-provider smoke evidence for Bedrock,
  Claude, and Codex on this branch.

---

## Phase 0 — Baseline and Audit

**Purpose:** Establish a known-good baseline before adding more tests or
hardening logic.

### 0.1 Capture the current green state

Run the existing required gates first:

```bash
npx biome check src-server/ src-ui/ packages/
npx tsc --noEmit
npm test -- --run
```

If UI-facing connected-agent changes are present, also run the existing e2e:

```bash
PW_BASE_URL=http://localhost:5274 npx playwright test tests/orchestration-provider-picker.spec.ts
```

### 0.2 Inventory the proof surface

Create a short verification checklist in the PR or task notes covering:

- Adapter unit tests present for Bedrock, Claude, and Codex
- Orchestration service tests
- Orchestration route tests
- Event store tests
- UI e2e tests
- Manual smoke coverage

### 0.3 Freeze the acceptance vocabulary

Use these terms consistently in tests and docs:

- **Contract test:** provider-native event/request → canonical event
- **Integration test:** Hono route or service boundary with real collaborators
- **E2E test:** browser-driven user flow with route interception where needed
- **Smoke test:** real running app using `./stallion`

### Exit Criteria

- [x] Existing required quality gates pass on the current branch
- [x] Connected-agents proof surface is inventoried
- [x] Missing coverage is listed explicitly before implementation starts

---

## Phase 1 — Adapter Contract Hardening

**Purpose:** Make adapter correctness difficult to regress.

### 1.1 Normalize contract-test expectations

For each adapter test suite, assert canonical behavior at the same level of
detail:

- session start/configure events
- turn start/complete/abort behavior
- text deltas
- reasoning deltas, if supported
- tool started/progress/completed events
- approval request opened/resolved events
- token usage updates
- runtime error/warning mapping
- prerequisite reporting
- session stop/cleanup behavior

### 1.2 Add negative-path adapter coverage

Each provider must have explicit tests for:

- missing prerequisite(s)
- invalid or missing model selection
- malformed provider-native event payload
- process exit or SDK stream failure during a live session
- approval response for unknown request
- send-turn on unknown or closed session

### 1.3 Enforce provider parity where intended

Add a shared test helper or fixtures so all adapters are checked against the
same canonical expectations where the product promises parity.

Provider-specific differences should be explicit and documented, not accidental.

### Exit Criteria

- [x] Bedrock, Claude, and Codex adapter suites cover success and failure paths
- [x] All adapters are checked against a shared canonical expectation set
- [x] Provider-specific behavior differences are documented in tests or comments

---

## Phase 2 — Orchestration and Persistence Proofs

**Purpose:** Prove that the server-side orchestration layer works end-to-end
with real state transitions, not just isolated method calls.

### 2.1 Expand orchestration service coverage

Add tests for:

- start session → send turn → stop session lifecycle
- ownership resolution when sessions exist across different providers
- dispatch rejection when provider prerequisites are missing
- request response routing to the correct adapter
- interrupt routing to the correct adapter
- adapter event fan-in from multiple providers
- duplicate or out-of-order event handling

### 2.2 Expand event-store and recovery coverage

Add tests for:

- append-only persistence of all canonical event categories
- session-state projection accuracy after mixed event sequences
- restart recovery using `resumeCursor`
- failed resume path marks the session closed with observable reason
- event ordering guarantees used by the UI/read model

### 2.3 Prove route-level SSE behavior

Add route/integration tests for:

- orchestration event stream connects successfully
- streamed canonical events are emitted in expected order
- multiple event types survive serialization/deserialization
- request/open + request/resolve events reach subscribers

### Exit Criteria

- [x] Orchestration service covers lifecycle, dispatch, approval, interrupt, and fan-in flows
- [x] Event store tests cover persistence, projection, and restart recovery
- [x] SSE route coverage proves canonical events reach clients correctly

---

## Phase 3 — UI and SSE End-to-End Coverage

**Purpose:** Verify the user-visible connected-agents experience, not just the
server internals.

### 3.1 Strengthen provider-picker coverage

Extend `tests/orchestration-provider-picker.spec.ts` or split it into focused
specs that verify:

- provider dropdown shows Bedrock, Claude, Codex
- provider-specific controls appear and disappear correctly
- provider change persists in active chat state
- unavailable providers or missing prerequisites show a clear disabled/error UI

### 3.2 Add orchestration conversation e2e coverage

Create a new Playwright spec for the full chat flow using intercepted routes or
mock SSE:

- open a coding layout
- start a provider session through the UI
- send a prompt
- stream text/tool/request events into the client
- assert rendered transcript, tool cards, and approval UI
- approve or reject a request and assert follow-up UI state

### 3.3 Add restart/reconnect UI coverage

Create an e2e or integration-level test that proves:

- an existing session restored from persisted state appears in the UI
- reconnecting to the page rehydrates session state correctly
- closed or failed sessions are shown as closed, not left spinning forever

### 3.4 Add regression coverage for provider options

Verify that provider-specific settings round-trip through UI state and are sent
to the orchestration layer:

- Bedrock model selection
- Claude thinking/effort options
- Codex reasoning effort / fast mode

### Exit Criteria

- [x] Provider picker coverage includes disabled/error and persistence cases
- [x] Full chat e2e proves transcript/tool/request rendering from canonical events
- [x] Reconnect/recovery behavior is tested from the UI perspective
- [x] Provider-specific options are asserted end-to-end

---

## Phase 4 — Real Runtime Smoke Matrix

**Purpose:** Add a human-runnable smoke matrix against a live local app so we
do not rely only on mocks.

### 4.1 Standard local runtime command

Always use reserved agent ports, never the user's default ports:

```bash
./stallion start --clean --force --port=3242 --ui-port=5274
```

### 4.2 Smoke scenarios

Run these manually against the live app:

1. **Bedrock smoke**
   Start session, send turn, confirm response renders.

2. **Claude smoke**
   If `ANTHROPIC_API_KEY` is configured, start session, send turn, confirm
   response and any approval flows render correctly.

3. **Codex smoke**
   If `codex` and `OPENAI_API_KEY` are configured, start session, send turn,
   confirm response, command/tool rendering, and approval handling.

4. **Recovery smoke**
   Start a session, reload or restart the app, confirm recoverable state is
   restored or correctly marked closed.

5. **Prerequisite smoke**
   Temporarily simulate missing credentials or CLI availability and verify the
   provider UI communicates the reason cleanly.

### 4.3 Record evidence

For each smoke, record:

- provider used
- exact date/time
- commit SHA
- whether credentials/CLI were available
- pass/fail result
- screenshots or notes for failures

### Exit Criteria

- [ ] Live app smoke run exists for Bedrock
- [ ] Live app smoke run exists for Claude when credentials are available
- [ ] Live app smoke run exists for Codex when CLI and credentials are available
- [ ] Recovery and prerequisite smokes are documented

---

## Phase 5 — Release Gate and Regression Workflow

**Purpose:** Make connected-agents verification repeatable and non-optional.

### 5.1 Define the required release gate

Connected-agents work is not complete until all of these pass:

```bash
npx biome check src-server/ src-ui/ packages/
npx tsc --noEmit
npm test -- --run
./stallion start --clean --force --port=3242 --ui-port=5274
PW_BASE_URL=http://localhost:5274 npx playwright test tests/orchestration-provider-picker.spec.ts
```

As coverage expands, add the new connected-agent specs here explicitly.

### 5.2 Add a connected-agents test target

Prefer a dedicated command or documented command group that can be run before
merging connected-agents changes. For example:

```bash
npx vitest run src-server/providers/__tests__/bedrock-adapter.test.ts \
  src-server/providers/__tests__/claude-adapter.test.ts \
  src-server/providers/__tests__/codex-adapter.test.ts \
  src-server/services/__tests__/orchestration-service.test.ts \
  src-server/services/__tests__/event-store.test.ts \
  src-server/routes/__tests__/orchestration.routes.test.ts
```

If this becomes unwieldy, add an npm script or test grouping convention.

### 5.3 Block sign-off on missing evidence

No connected-agents task is signed off unless:

- all required commands pass
- all relevant e2e specs pass
- the smoke matrix is executed or explicitly documented as blocked by missing
  external credentials/CLI
- any blocked provider path is called out clearly in the final task summary

### Exit Criteria

- [x] Release gate commands are documented and current
- [x] Connected-agents verification can be run as a focused suite
- [x] Task sign-off requires both automated and smoke evidence

---

## Verification Matrix

| Surface | Proof Type | Minimum Evidence |
|---|---|---|
| Bedrock adapter | Unit/contract | canonical event mapping, prerequisites, failure paths |
| Claude adapter | Unit/contract | canonical event mapping, approvals, prerequisites, failure paths |
| Codex adapter | Unit/contract | JSON-RPC mapping, approvals, prerequisites, process failure |
| Orchestration service | Integration | lifecycle dispatch, provider routing, fan-in, interrupts |
| Event store | Integration | persisted events, projections, restart recovery |
| Orchestration SSE | Integration | serialized canonical events reach subscribers in order |
| Provider picker UI | Playwright | provider controls, disabled states, persisted chat state |
| Conversation UI | Playwright | transcript/tool/approval rendering from event stream |
| Recovery UI | Playwright/manual | restored or closed session state after reload/restart |
| Live runtime | Manual smoke | one successful run per available provider |

---

## File Index

Files expected to be created or significantly modified by this plan:

- `.plans/README.md` — mark Plan 01 complete and Plan 02 active
- `.plans/02-connected-agents-hardening-and-verification.md` — new
- `src-server/providers/__tests__/bedrock-adapter.test.ts` — expand
- `src-server/providers/__tests__/claude-adapter.test.ts` — expand
- `src-server/providers/__tests__/codex-adapter.test.ts` — expand
- `src-server/services/__tests__/orchestration-service.test.ts` — expand
- `src-server/services/__tests__/event-store.test.ts` — expand
- `src-server/routes/__tests__/orchestration.routes.test.ts` — expand
- `tests/orchestration-provider-picker.spec.ts` — expand or split
- `tests/orchestration-chat-flow.spec.ts` — new
- `tests/orchestration-recovery.spec.ts` — new
- `package.json` — optional, if a dedicated verification script is added
- `docs/guides/testing.md` — optional, if connected-agent conventions need to be codified there

---

## Decision Log

| # | Decision | Rationale | Date |
|---|---|---|---|
| D1 | Define "100% verified" as 100% of agreed acceptance checks, not theoretical impossibility coverage | Makes sign-off concrete and enforceable | 2026-04-05 |
| D2 | Require both automated evidence and live smoke evidence | Mocks alone are insufficient for connected runtimes | 2026-04-05 |
| D3 | Keep provider-parity expectations explicit in shared tests | Prevents silent capability drift between providers | 2026-04-05 |
| D4 | Fail closed in the UI when a persisted orchestration session is absent from the reconnect snapshot | Prevents stuck "sending" state after restart/reload | 2026-04-05 |
| D5 | Add a dedicated `test:connected-agents` target plus explicit Playwright specs for provider picker, chat flow, and recovery | Keeps regression checks focused and repeatable | 2026-04-05 |

---

*Last updated: 2026-04-05*
*Author: Codex*
