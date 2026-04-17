---
name: instinct-analysis
description: Analyze session observations and create/update instincts with confidence
  scoring. Runs as a boo scheduled job or on-demand.
---

# Instinct Analysis

Reads recent observations, detects patterns, creates or updates instincts.

## Agents

This skill runs as a boo job (`stallion-instinct-analysis`) or can be invoked manually.

## Workflow

1. Read recent observations from `$SOUL_PATH/knowledge/instincts/` (JSONL files)
2. Load existing instincts (project + global) to avoid duplicates
3. Detect patterns across observations:
   - **Corrections** → instinct: "When doing X, prefer Y"
   - **Error resolutions** → instinct: "When encountering error X, try Y"
   - **Repeated workflows** → instinct: "When doing X, follow steps Y, Z, W"
   - **Tool preferences** → instinct: "When needing X, use tool Y"
4. For each pattern (3+ observations required):
   - If matching instinct exists: update confidence (+0.05 per observation)
   - If no match: create new instinct at confidence 0.3-0.5
5. Apply confidence decay (-0.02/week) to instincts not observed in 7+ days
6. Prune instincts with confidence < 0.2
7. Write summary to analysis log

## Rules

- Be conservative: only create instincts for clear patterns (3+ observations)
- Use narrow, specific triggers
- Never include actual code snippets — only describe patterns
- Default to project scope unless the pattern is clearly universal
- Merge similar instincts rather than creating duplicates

## Boo Job

```
Name: stallion-instinct-analysis
Schedule: 0 10,14,18 * * 1-5 (3x/day weekdays)
Prompt: @instinct-analysis
Timeout: 300s
Tools: knowledge, fs_read, fs_write, thinking, glob, grep
```
