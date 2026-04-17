# Agent Eval Suite

Three-layer evaluation suite for the Stallion agent system.

## Quick Start

```bash
# Run static + integration (fast, no LLM cost)
bash evals/run.sh

# Run behavioral evals (slow, uses LLM credits)
bash evals/run.sh llm

# View results in browser
cd evals && promptfoo view
```

## Layers

### Layer 1: Static (`bash run.sh static`)
Validates installed agent package structure — schema, resources, hooks, routing, MCP servers, KB sources, write-tool invariants. Runs in seconds, no LLM.

### Layer 2: Integration (`bash run.sh integration`)
Validates telemetry pipeline contract — event schemas, type mapping, field presence, prompt capture, tool capture, redaction, agent discovery. Runs in seconds, no LLM.

### Layer 3: Behavioral (`bash run.sh llm`)
Runs agents via `kiro-cli chat --no-interactive` and scores against skill-level assertions. Uses [promptfoo](https://promptfoo.dev) for scoring, regression tracking, and visualization.

**Agents tested:** `dev`, `sales-sa`

**Assertion types:**
- `delegated-to` — checks telemetry for subagent delegation targets
- `tool-called` — checks a specific tool was invoked
- `no-write-tools` — verifies tool-* agents didn't call write tools
- `llm-rubric` — LLM judge scores workflow compliance against skill definitions

## Adding Eval Cases

Add test entries to `promptfooconfig.yaml`. Each test needs:
- `vars.agent` — which agent to run
- `vars.prompt` — the user prompt
- `options.provider.id` — exec provider with `KIRO_EVAL_AGENT=<agent>`
- `assert` — array of deterministic + semantic assertions

## Cost

- Layers 1+2: Free
- Layer 3: ~$0.20-0.50 per case (agent invocation + LLM judge)
- Full suite (~9 cases): ~$2-5 per run

## Prerequisites

- `kiro-cli` on PATH
- `promptfoo` installed (`brew install promptfoo`)
- `jq` on PATH
- Agents installed via `# No install needed — edits are live
