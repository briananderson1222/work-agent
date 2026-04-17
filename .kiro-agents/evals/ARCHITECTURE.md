# Agent Eval Suite — Architecture & Vision

## Vision

This eval suite exists to answer one question: **are the agents doing what their prompts and skills tell them to do?**

As the agent system grows (25 agents, 39 skills, 5 orchestrators), prompt and skill edits inevitably cause regressions. A change to the dev agent's workflow might break its explore skill activation. A tweak to sales-sa's delegation logic might cause it to stop parallelizing calendar+email lookups. Without automated evaluation, these regressions are invisible until a user notices something feels wrong.

The eval suite provides a feedback loop:
1. **Run** evals against real agents
2. **Diagnose** failures — which skill wasn't activated, which workflow step was skipped
3. **Fix** the source prompt or skill
4. **Rebuild** and reinstall the agent package
5. **Verify** the fix resolved the failure without breaking other cases
6. **Repeat** until all cases pass

The goal is not 100% pass rate on day one. It's a ratchet — every failure you fix becomes a regression test that prevents that failure from recurring.

## Architecture

### Three Layers

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: LLM Behavioral Evals (promptfoo)              │
│  Runs real agents, checks skill activation + workflow   │
│  compliance via deterministic telemetry assertions +    │
│  LLM-as-judge rubric scoring                            │
│  Cost: ~$0.20-0.50/case  Time: ~30-180s/case            │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Telemetry Contract (bash)                     │
│  Validates the telemetry pipeline produces correct      │
│  event schemas, type mapping, field presence,           │
│  prompt/tool capture, and redaction                     │
│  Cost: free  Time: ~5s                                  │
├─────────────────────────────────────────────────────────┤
│  Layer 1: Static Package Validation (bash)              │
│  Validates all 25 installed agent configs — schema,     │
│  resources, hooks, routing, MCP, KBs, write invariants  │
│  Cost: free  Time: ~3s                                  │
└─────────────────────────────────────────────────────────┘
```

Layers 1+2 run on every build. Layer 3 runs before releases or after prompt/skill changes.

### How Layer 3 Works

```
promptfoo eval
    │
    ▼
exec provider (kiro-dev.sh / kiro-sales-sa.sh)
    │
    ├── Snapshots telemetry line count
    ├── Runs: kiro-cli chat --agent <agent> --no-interactive --trust-tools <safe-tools> "<prompt>"
    ├── Strips ANSI codes from output
    └── Returns clean response text to promptfoo
    │
    ▼
Assertions run against the response + telemetry:
    │
    ├── delegated-to.js    — reads new telemetry events, checks use_subagent targets
    ├── tool-called.js     — checks if a specific tool was invoked
    ├── no-write-tools.js  — verifies tool-* agents didn't call write tools
    └── llm-rubric         — LLM judge scores workflow compliance against skill definition
```

Key design decisions:
- **Safe tools only**: The provider trusts read + delegation tools but NOT writes. The agent attempts writes (visible in telemetry as tool.invoke events) but they're blocked. This lets us verify intent without side effects.
- **Telemetry snapshot**: Before each run, the provider records the telemetry file's line count. Assertions read only events after that line — isolating this run's events from historical data.
- **Two assertion types**: Deterministic (from telemetry, free, reliable) and semantic (LLM judge, costs money, provides workflow-level feedback). Run deterministic-only with `--filter-failing` to skip expensive judge calls on already-passing cases.

### What Kiro Exposes (and Doesn't)

The eval suite works within kiro's hook system. Here's what's available:

**Captured in telemetry (usable for assertions):**
- `session.start` / `session.end` — agent name, duration, system info
- `turn.user` — full prompt text + length
- `tool.invoke` — tool name + full input parameters (including use_subagent with target agent + query)
- `tool.result` — tool name + full output

**NOT captured (the gaps):**
- LLM assistant responses — no `turn.assistant` event. We capture the response via stdout instead.
- Resource loading — no event for which context files/skills were loaded
- Token usage / cost — no token counts in telemetry
- Model reasoning between tool calls — only the `thinking` tool is captured

This means: we can verify WHAT the agent did (tools, delegations) but not WHY from telemetry alone. The LLM judge fills this gap by analyzing the response text.

## File Structure

```
kiro-agents/evals/
├── run.sh                              # Entry point
│                                       #   run.sh              → layers 1+2
│                                       #   run.sh static       → layer 1
│                                       #   run.sh integration  → layer 2
│                                       #   run.sh llm dev      → layer 3, dev only
│                                       #   run.sh llm sales-sa → layer 3, sales-sa only
│
├── static/
│   └── test_package.sh                 # Layer 1: 126 checks across 25 agents
│                                       # Schema, templates, hooks, resources, routing,
│                                       # MCP servers, KBs, write-tool invariants, agent cards
│
├── integration/
│   └── test_telemetry.sh              # Layer 2: 26 telemetry contract checks
│                                       # Event type mapping, schema fields, prompt capture,
│                                       # tool capture, redaction, agent discovery, soul env
│
├── lib/
│   ├── kiro-provider.sh               # Core exec provider — runs kiro-cli, strips ANSI,
│   │                                   # snapshots telemetry, returns clean response
│   ├── kiro-dev.sh                    # Wrapper: sets KIRO_EVAL_AGENT=dev
│   ├── kiro-sales-sa.sh              # Wrapper: sets KIRO_EVAL_AGENT=sales-sa
│   └── assertions/
│       ├── telemetry-utils.js         # Reads telemetry JSONL, extracts events since snapshot
│       ├── delegated-to.js            # Assert: agent delegated to expected subagent(s)
│       ├── tool-called.js             # Assert: specific tool was invoked
│       └── no-write-tools.js          # Assert: tool-* agents didn't call write tools
│
├── cases/
│   ├── dev/
│   │   ├── promptfooconfig.yaml       # 3 test cases: explore, workflow, dependency-update
│   │   ├── explore.yaml               # Reference case definitions (not used by promptfoo directly)
│   │   ├── workflow.yaml
│   │   └── dependency-update.yaml
│   └── sales-sa/
│       ├── promptfooconfig.yaml       # 5 test cases: daily (2), activity (2), email (2)
│       ├── daily.yaml
│       ├── activity.yaml
│       └── email.yaml
│
├── skills/
│   └── eval-rebuild/
│       └── SKILL.md                   # Injectable skill: project-specific build commands
│                                       # Replace this for different build systems
│
├── results/
│   └── .gitkeep                       # Eval results stored here (gitignored)
│
├── promptfooconfig.yaml               # Legacy combined config (use cases/*/promptfooconfig.yaml instead)
└── README.md                          # Quick-start guide
```

## Eval Cases

### Dev Agent (3 cases, 10 assertions)

| Case | Skill Tested | Key Assertions |
|------|-------------|----------------|
| Explore codebase | `explore` | Delegates to tool-explore-{structure,entry,deps} in parallel; uses use_subagent; no writes by tool-* agents; judge checks Wave 1 fan-out pattern |
| Create hello.py | Default workflow | Uses todo_list (Phase 2 plan); no writes by tool-* agents; judge checks Phase 0-5 compliance |
| Check dependencies | `dependency-update` | Delegates to tool-dependencies-updater; no writes; judge checks skill activation vs manual checking |

### Sales-SA Agent (5 cases, 15 assertions)

| Case | Skill Tested | Key Assertions |
|------|-------------|----------------|
| Good morning | `sa-daily` (morning) | Delegates to tool-calendar + tool-email (parallel); no writes; judge checks morning mode + structured overview |
| Wrap up day | `sa-daily` (evening) | Delegates to tool-calendar + tool-crm; no writes; judge checks evening mode + gap identification |
| Log meetings | `sa-activity` (calendar review) | Delegates to tool-calendar; no writes; judge checks mode detection + classification workflow |
| Check email | `sa-email` (triage) | Delegates to tool-email; no writes; judge checks narrate-before-acting + priority categorization |
| Search emails | `sa-email` (search) | Delegates to tool-email; no writes; judge checks search mode + narration |

## The Eval-Builder Agent

A standalone kiro agent (`~/.kiro/agents/eval-builder.json`) that automates the feedback loop:

```bash
kiro-cli chat --agent eval-builder
> "Run the dev evals and fix the failures"
```

It follows: RUN → DIAGNOSE → FIX → REBUILD → RE-VERIFY → REPORT.

The rebuild step is abstracted via the `eval-rebuild` skill (`evals/skills/eval-rebuild/SKILL.md`). This skill defines the project-specific build commands (currently AIM/Brazil). To adapt for a different build system, replace the skill — the eval-builder's workflow stays the same.

## The Build Pipeline

Source edits flow through this pipeline:

```
Source packages (kiro-agents/)
    │
    ▼  build
Validated build artifacts (build/)
    │
    ▼  # No uninstall needed — flat structure
Installed package (~/.kiro-agents/)
    │
    ├── agents/          25 agent-spec.json files
    ├── skills/          39 SKILL.md files
    ├── context/         31 context files + scripts
    ├── powers/          12 MCP server definitions
    ├── agent-sops/      5 SOP files
    └── .telemetry/      Runtime telemetry (full.jsonl, analytics.jsonl)
    │
    ▼  AIM transforms agent-specs for kiro client
Kiro agent configs (~/.kiro/agents/agents/.json)
    │
    ▼  kiro-cli chat --agent <name>
Running agent with context, skills, hooks, telemetry
```

Key: NEVER edit installed copies. Always edit source, rebuild, reinstall.

## Known Issues & Gaps

### Promptfoo Provider Limitations
- `exec:` provider can't pass env vars inline (`VAR=val cmd` fails with spawn ENOENT). Workaround: thin wrapper scripts per agent (kiro-dev.sh, kiro-sales-sa.sh).
- Per-test provider selection via `options.provider` requires the full provider ID string, not a label.
- Tests run against ALL providers by default. Use per-agent promptfooconfig.yaml files in `cases/<agent>/` to isolate.

### Telemetry Gaps
- No `turn.assistant` event — can't see the LLM's response in telemetry. Captured via stdout instead.
- No resource loading events — can't verify which context files/skills were loaded.
- No token usage data — can't track eval cost from telemetry.

### Eval Coverage
- Only dev and sales-sa agents have behavioral evals. stallion, aws, and builder need cases.
- No multi-turn conversation evals yet — all cases are single-turn.
- No adversarial/red-team cases yet.

## Eval Types

### Capability Evals
Test new behavior — "can the agent do X that it couldn't before?"
- Used when adding new skills, agents, or workflow steps
- Threshold: pass@3 >= 90% (at least 1 success in 3 attempts)
- Tag in promptfooconfig.yaml: `metadata.type: capability`

### Regression Evals
Ensure existing behavior isn't broken — "does X still work after changes?"
- Used when modifying prompts, skills, or agent routing
- Threshold: pass^3 = 100% (all 3 attempts must succeed)
- Tag in promptfooconfig.yaml: `metadata.type: regression`
- All existing eval cases are implicitly regression evals

### Tagging Convention
Add `metadata` to each test case:
```yaml
- vars:
    prompt: "..."
  metadata:
    type: capability | regression
    skill: sa-verify | tdd-workflow | explore | ...
    added: 2026-04-05
  assert: [...]
```

## Grader Taxonomy

| Grader | Implementation | Cost | When to Use |
|--------|---------------|------|-------------|
| Code (deterministic) | JS assertions in `lib/assertions/` | Free | Tool calls, delegation targets, structural checks |
| Model (LLM judge) | `llm-rubric` in promptfoo | ~$0.05/eval | Workflow compliance, quality of reasoning, open-ended output |
| Human (manual) | Flag in eval report | Free | Security-sensitive changes, ambiguous quality judgments |

### Grader Selection Guide
1. If you can check it with telemetry → code grader (always preferred)
2. If it's about workflow compliance or output quality → model grader
3. If it's security-critical or subjective → human grader (flag for review)

Existing mapping:
- `delegated-to.js` → code grader
- `tool-called.js` → code grader
- `no-write-tools.js` → code grader
- `max-tool-calls.js` → code grader
- `llm-rubric` → model grader

## pass@k Metrics

### Definitions
- **pass@1**: First-attempt success rate. Direct reliability measure.
- **pass@3**: At least 1 success in 3 attempts. Practical reliability under retries.
- **pass^3**: All 3 attempts succeed. Stability/consistency measure.

### Thresholds
| Eval Type | Metric | Target |
|-----------|--------|--------|
| Capability | pass@3 | >= 0.90 |
| Regression | pass^3 | = 1.00 |
| Release gate | pass@1 | >= 0.80 (all cases) |

### Implementation
pass@k is implemented as a wrapper around promptfoo's `--repeat` flag:
```bash
# Run each case 3 times
promptfoo eval --repeat 3 -c cases/dev/promptfooconfig.yaml

# The pass-at-k.js assertion aggregates results across runs
```

The `pass-at-k.js` assertion reads promptfoo's output and computes pass@k per case.

## Anti-Patterns

- **Overfitting prompts to eval examples** — if a prompt change only helps the eval phrasing but not real usage, it's overfitting
- **Happy-path-only evals** — always include edge cases, error scenarios, and adversarial inputs
- **Ignoring cost drift** — track eval cost per run; if it's growing, optimize before it becomes a barrier to running evals
- **Flaky graders in release gates** — if a model grader is inconsistent, replace with a code grader or tighten the rubric
- **Eval rot** — when skills change, update the corresponding eval cases. Stale evals give false confidence
## Grader Taxonomy

| Grader | Implementation | Cost | When to Use |
|--------|---------------|------|-------------|
| Code (deterministic) | JS assertions in `lib/assertions/` | Free | Tool calls, delegation targets, structural checks |
| Model (LLM judge) | `llm-rubric` in promptfoo | ~$0.05/eval | Workflow compliance, quality of reasoning, open-ended output |
| Human (manual) | Flag in eval report | Free | Security-sensitive changes, ambiguous quality judgments |

### Grader Selection Guide
1. If you can check it with telemetry → code grader (always preferred)
2. If it's about workflow compliance or output quality → model grader
3. If it's security-critical or subjective → human grader (flag for review)

Existing mapping:
- `delegated-to.js` → code grader
- `tool-called.js` → code grader
- `no-write-tools.js` → code grader
- `max-tool-calls.js` → code grader
- `llm-rubric` → model grader

## pass@k Metrics

### Definitions
- **pass@1**: First-attempt success rate. Direct reliability measure.
- **pass@3**: At least 1 success in 3 attempts. Practical reliability under retries.
- **pass^3**: All 3 attempts succeed. Stability/consistency measure.

### Thresholds
| Eval Type | Metric | Target |
|-----------|--------|--------|
| Capability | pass@3 | >= 0.90 |
| Regression | pass^3 | = 1.00 |
| Release gate | pass@1 | >= 0.80 (all cases) |

### Implementation
pass@k is implemented as a wrapper around promptfoo's `--repeat` flag:
```bash
# Run each case 3 times
promptfoo eval --repeat 3 -c cases/dev/promptfooconfig.yaml

# The pass-at-k.js assertion aggregates results across runs
```

The `pass-at-k.js` assertion reads promptfoo's output and computes pass@k per case.

## Anti-Patterns

- **Overfitting prompts to eval examples** — if a prompt change only helps the eval phrasing but not real usage, it's overfitting
- **Happy-path-only evals** — always include edge cases, error scenarios, and adversarial inputs
- **Ignoring cost drift** — track eval cost per run; if it's growing, optimize before it becomes a barrier to running evals
- **Flaky graders in release gates** — if a model grader is inconsistent, replace with a code grader or tighten the rubric
- **Eval rot** — when skills change, update the corresponding eval cases. Stale evals give false confidence

## Extending the Suite

### Adding a New Agent

1. Create a wrapper script: `lib/kiro-<agent>.sh`
2. Create a cases directory: `cases/<agent>/promptfooconfig.yaml`
3. Write test cases with deterministic + semantic assertions
4. Update `run.sh` if needed (it auto-discovers `cases/*/promptfooconfig.yaml`)

### Adding a New Eval Case

Add a test entry to the agent's `cases/<agent>/promptfooconfig.yaml`:

```yaml
- vars:
    prompt: "Your test prompt here"
  assert:
    - type: javascript
      value: file://../../lib/assertions/delegated-to.js
      config:
        expected: ['tool-name']
    - type: javascript
      value: file://../../lib/assertions/no-write-tools.js
    - type: llm-rubric
      value: |
        Describe the expected behavior. Reference the skill's workflow.
        Score 1 if completely wrong, 3 if partial, 5 if fully correct.
```

### Adding a New Assertion

Create a JS file in `lib/assertions/` that exports a function:

```javascript
// my-assertion.js
const { getNewEvents } = require('./telemetry-utils');
module.exports = (output, { config }) => {
  const events = getNewEvents();
  // Check something...
  return { pass: true/false, score: 0-1, reason: 'explanation' };
};
```

### Adapting for a Different Build System

Replace `evals/skills/eval-rebuild/SKILL.md` with your project's build commands. The eval-builder agent reads this skill to know how to rebuild after fixes. Everything else (assertions, cases, promptfoo config) is build-system agnostic.

## First Failure Analysis (from initial eval run)

**Dev agent — "Explore this codebase"**: FAILED

Root cause: The dev agent's system prompt Phase 1 (ORIENT) says "explore relevant code" and lists tool-explore-* subagents as parenthetical options. The agent interprets this as "I can explore directly" rather than "I should activate the explore skill." The explore skill defines a parallel fan-out to 6+ subagents, but the system prompt competes with it.

Proposed fix: Add a skill activation section to the dev agent's system prompt:
```
## Skill Activation
Your context includes loaded skills. When a user's request matches a skill's
description, follow that skill's workflow instead of the default phases below.
Skills define the expert approach — don't shortcut them with simpler alternatives.
After a skill workflow completes, proceed to VALIDATE and DELIVER.
```

And remove the hardcoded subagent names from Phase 1 ORIENT (let the explore skill define those).

This fix has not been applied yet — it's the first task for the eval-builder agent.
