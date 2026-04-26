# Execution Pattern

> How any AI agent (Claude Code, Codex, Hermes, or any other) picks up work from the roadmap, implements it, and updates the strategy docs. This document is self-contained -- an agent should be able to follow it without prior conversation context.

*Last updated: 2026-04-26*

---

## Entry Point

When starting work on Stallion, read these documents in order:

1. **[constitution.md](constitution.md)** -- Understand what Stallion is and its non-negotiables
2. **[differentiators.md](differentiators.md)** -- Understand what makes it different and what to protect
3. **[roadmap.md](roadmap.md)** -- Find the current active phase and available tasks
4. **[CLAUDE.md](/CLAUDE.md)** (repo root) -- Technical conventions, CI gates, code style, navigation patterns

---

## Picking Up Work

### Step 1: Find the active phase

Open [roadmap.md](roadmap.md). Look for the phase marked **"Status: In Progress"**. This is where work should focus. If the roadmap also calls out an active initiative inside that phase, prefer that initiative first. Do not start work on a later phase unless all tasks in the active phase are complete or explicitly blocked.

### Step 2: Choose a task

Within the active phase, find an unchecked (`[ ]`) task. Tasks within a phase can be parallelized unless one is marked as **(BLOCKING)**, which means downstream tasks depend on it completing first.

If multiple agents are working simultaneously:
- Each agent should pick a different task
- Create a branch immediately to signal ownership (see Step 3)
- If you discover another branch already exists for a task, pick a different one

### Step 3: Create a branch

```
feat/<phase>-<task-slug>

# Examples:
feat/phase1-remove-bedrock-gate
feat/phase2-create-plugin-cli
feat/phase3-subagent-delegation
```

### Step 4: Read the verification criteria

Every task in the roadmap has a **"Done when"** statement. Read it before writing any code. Your implementation must satisfy these criteria.

If the task changes user-visible behavior and there is no durable automated proof for that behavior yet, add one as part of the task. A roadmap item is not fully complete if it relies only on memory, manual local setup quirks, or one-time human signoff to prevent regression.

### Step 4a: Define telemetry before implementation

Every non-trivial plan must include a **Telemetry** section before execution begins. Treat telemetry as part of the implementation contract, not a cleanup item.

At minimum, the plan must state:

- which user/system events are worth counting
- whether each event should be a counter, histogram, or trace span
- the instrument name in `src-server/telemetry/metrics.ts`
- required attributes such as source, provider, connection type, outcome, reason, fallback source, or freshness
- where the event is emitted in the server/UI/plugin flow
- how fallback, degraded, retry, and error paths are tracked
- which test or smoke lane proves the instrumentation call exists

If a feature intentionally has no telemetry, the plan must say why. Acceptable reasons are narrow: pure copy/docs changes, dead-code removal with no runtime path, or test-only refactors.

### Step 5: Implement

Follow the project's conventions:

- **Code style**: See `CLAUDE.md` -- immutable patterns, small files (<800 lines), small functions (<50 lines)
- **Data fetching**: `useQuery`/`useMutation` from `@tanstack/react-query`, SDK hooks preferred
- **Navigation**: Use `setLayout()` from `useNavigation()`, never raw `navigate()`
- **New features**: Must include OTel instrumentation from the plan's Telemetry section (`src-server/telemetry/metrics.ts`)
- **Tests**: 80% coverage minimum. TDD when adding new functionality.

### Step 6: Run CI gates

Before considering the task done:

```bash
npx biome check src-server/ src-ui/ packages/   # Lint + format
npx tsc --noEmit                                  # Type check
npm test                                          # Unit tests
npm run verify:static                             # Combined pre-commit/static gate
```

All three must pass. No exceptions.

If UI changes were made, run the full Playwright coverage contract unless the
task is explicitly scoped to a narrower lane:
```bash
npm run verify:e2e:full
```

Every new or moved Playwright spec must be assigned in `tests/e2e-manifest.mjs`
before the task is done.

### Step 7: Mark the task done

Edit [roadmap.md](roadmap.md) and change the task checkbox from `[ ]` to `[x]`.

If the task was the last unchecked item in a phase, update the phase status to **"Status: Complete"** and the next phase to **"Status: In Progress"**.

### Step 8: Update strategy docs if needed

If during implementation you discovered:
- A differentiator claim that doesn't match reality -- update [differentiators.md](differentiators.md)
- A competitor feature worth tracking -- add to [competitive-landscape.md](competitive-landscape.md)
- A new insight about the project's identity -- propose an update to [constitution.md](constitution.md) (requires human approval)
- A task that should be added to the roadmap -- add it to the appropriate phase

Always note the date when updating strategy docs.

---

## Updating Strategy Docs

| Document | Who can update | Approval required |
|----------|---------------|-------------------|
| `constitution.md` | Anyone can propose | **Human approval required** |
| `differentiators.md` | Any agent or human | No, but note the date and reason |
| `competitive-landscape.md` | Any agent or human | No, refresh quarterly |
| `roadmap.md` | Any agent or human | No, but coordinate if adding phases |
| `vision/ai-ui-bridge.md` | Any agent or human | No |
| `ideation-log.md` | Any agent or human | No (append-only) |

When updating, add a line to the "Last updated" date at the top of the document.

---

## Coordination Between Agents

### Parallel work

Multiple agents can work on the same phase simultaneously. The coordination mechanism is git branches:

1. Before starting a task, check if a branch already exists: `git branch -a | grep <task-slug>`
2. If it exists, pick a different task
3. If two agents independently start the same task, the first PR merged wins; the other should rebase or close

### Conflicting approaches

If two agents propose different architectural approaches for the same problem:

1. Check the strategy docs -- `constitution.md` and `differentiators.md` are the tiebreakers
2. If the docs don't resolve the conflict, the approach that better serves the active phase's "Definition of Done" wins
3. If still ambiguous, flag for human decision

### Dependency management

Tasks marked **(BLOCKING)** must complete before downstream tasks start. The blocking relationships are:
- Phase 1a (Remove Bedrock Gate) blocks Phase 1b (Pluggable Adapters)
- Phase 1b blocks Phase 2c (Plugin Registry -- needs pluggable providers to be meaningful)
- Phase 3a (Docs & Demos) should precede 3b/3c (builds on documented patterns)

---

## Verification Checklist

Before marking any task complete, verify:

- [ ] Code compiles (`npx tsc --noEmit`)
- [ ] Linting passes (`npx biome check src-server/ src-ui/ packages/`)
- [ ] Tests pass (`npm test`)
- [ ] Task-specific "Done when" criteria met
- [ ] A reusable automated verification lane exists for the behavior changed, or an explicit existing lane is referenced
- [ ] Plan includes a Telemetry section, or explicitly documents why telemetry is not applicable
- [ ] No hardcoded secrets or credentials
- [ ] No mutation patterns (immutable preferred)
- [ ] New features have OTel instrumentation wired through existing `src-server/telemetry/metrics.ts` patterns
- [ ] Fallback/degraded/error paths are counted when the feature can enter those states
- [ ] Strategy docs updated if insights discovered

---

## Skills for Strategy Work

These skills help iterate on the strategy itself (not code implementation):

| Skill | Purpose | When to use |
|-------|---------|-------------|
| `/ideate` | Pull inspiration from competitor repos, suggest improvements | When exploring new feature ideas |
| `/competitive-scan` | Scan landscape for new tools, features, threats | Quarterly refresh or when evaluating priorities |
| `/differentiation-check` | Audit codebase against differentiators.md | After major feature work, to keep docs honest |
| `/adoption-blockers` | Walk through first-run experience, find friction | Before and after onboarding improvements |

---

## Quick Reference: Project CI Gates

```bash
# All three are required before any merge
npx biome check src-server/ src-ui/ packages/
npx tsc --noEmit
npm test

# For UI changes, also:
./stallion start --clean --force --port=3242 --ui-port=5274
PW_BASE_URL=http://localhost:5274 npx playwright test tests/<feature>.spec.ts

# Always use the stallion CLI, never raw npm scripts
./stallion --help
```
