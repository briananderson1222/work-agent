# .plans/

Architectural plans for Stallion AI. These are living documents that AI agents
and human developers reference when implementing features.

Plans are numbered sequentially. Each plan is self-contained with phases,
entry/exit criteria, and a decision log.

## How to use these plans

**For AI agents:** Read the relevant plan before starting implementation work.
Follow the phases in order. Check off exit criteria as you complete them. If
you need to make a decision not covered by the plan, add it to the Decision Log
section before proceeding.

For connected-agent work specifically:

1. Read [01-connected-agents-overhaul.md](./01-connected-agents-overhaul.md)
   first for architecture and responsibility boundaries.
2. Read [03-connections-runtime-ux.md](./03-connections-runtime-ux.md) second
   for the product/UX layer that must sit on top of that architecture.
3. Use [SESSION-HANDOFF-PROMPT.md](./SESSION-HANDOFF-PROMPT.md) when starting a
   fresh session or delegating bounded read-only discovery in parallel.

**For humans:** Review plans before approving agent-generated PRs. Plans
capture the "why" so you can evaluate whether the implementation matches intent.

## Active Plans

| # | Title | Status |
|---|-------|--------|
| 01 | [Connected Agents Overhaul](./01-connected-agents-overhaul.md) | Complete |
| 02 | [Connected Agents Hardening & Verification](./02-connected-agents-hardening-and-verification.md) | Active |
| 03 | [Connections UX and Runtime Abstractions](./03-connections-runtime-ux.md) | Active |
| 04 | [UX & Frontend Polish](./04-ux-frontend-polish.md) | Active |
