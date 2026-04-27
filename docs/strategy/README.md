# Stallion AI Strategy

> **For AI agents:** Read this directory before starting any work on Stallion. Start with [constitution.md](constitution.md), then [roadmap.md](roadmap.md), then [execution-pattern.md](execution-pattern.md).

> **For humans:** This directory contains Stallion's living strategy -- what it is, what makes it different, where it's going, and how to contribute.

---

## Documents

| Document | Purpose | When to read |
|----------|---------|-------------|
| [constitution.md](constitution.md) | Project identity, core beliefs, non-negotiables | First. Always. |
| [differentiators.md](differentiators.md) | What makes Stallion different (tiered, with honest current-state) | When evaluating features or positioning |
| [competitive-landscape.md](competitive-landscape.md) | Competitor analysis, steal list, industry gaps | When ideating or prioritizing |
| [roadmap.md](roadmap.md) | Phased execution plan with checkboxable tasks | When picking up implementation work |
| [execution-pattern.md](execution-pattern.md) | How any AI or human picks up and progresses work | Before starting any task |
| [vision/ai-ui-bridge.md](vision/ai-ui-bridge.md) | The AI <-> UI bridge north star | When working on bridge-related features |
| [ideation-log.md](ideation-log.md) | Running log of ideation session outputs | When reviewing past ideation |
| [veritas/work-agent-proving-ground.md](veritas/work-agent-proving-ground.md) | How this repo informs Veritas itself | When changing Veritas guidance or proof lanes |
| [veritas/proof-family-promotion-workflow.md](veritas/proof-family-promotion-workflow.md) | Promotion/demotion rules for proof families | Before making candidate checks required |
| [veritas/evidence-retention-policy.md](veritas/evidence-retention-policy.md) | What Veritas artifacts should be committed | Before adding generated evidence |

## Related Plans

- [../plans/plan-phase1-hardening.md](../plans/plan-phase1-hardening.md) — concrete execution sequence for Phase 1 hardening

## How These Docs Work

These are **living documents**, not frozen specs. They evolve as the project evolves.

- **Anyone can update** (AI or human) -- except `constitution.md` which requires human approval
- **Date your changes** -- update the "Last updated" line at the top
- **Note your reasoning** -- when changing strategy, briefly explain why
- **Keep it honest** -- if a differentiator claim doesn't match reality, update the doc, don't ignore it

## For AI Agents: Quick Start

```
1. Read constitution.md     → Understand identity and constraints
2. Read AGENTS.md (root)    → Technical conventions and CI gates
3. Read roadmap.md          → Find the active phase and an unclaimed task
4. Read execution-pattern.md → Follow the work pickup process
5. Create a branch, implement, verify, mark done
```

## Available Skills

| Skill | What it does |
|-------|-------------|
| `/ideate` | Pull inspiration from competitor repos, compare features, suggest improvements |
| `/competitive-scan` | Scan the AI tool landscape for new entrants and features |
| `/differentiation-check` | Audit codebase against differentiators.md for gaps |
| `/adoption-blockers` | Walk through first-run experience to find friction |
