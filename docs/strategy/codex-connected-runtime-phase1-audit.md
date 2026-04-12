# Codex Connected Runtime Phase 1 Audit

## Current Codex support

- The repo treats Codex as a connected runtime backed by the local `codex` CLI.
- The current Codex adapter already covers session lifecycle, turn start/interrupt, approvals, tool calls, and resume handling.

## Safe Phase 1 UI opportunities

- Add read-only session and status surfaces that mirror existing runtime events instead of introducing new execution paths.
- Surface approval state, tool-call progress, and turn state in the UI using the existing event stream.
- Provide task framing, summaries, and handoff cues as UI-only helpers that stay within current Codex capabilities.

## Blocked gaps

- Conversation forking is not part of the current connected-agent surface, so branch-style UI flows remain out of Phase 1.
- `request-user-input` is not exposed in the current repo surface, so live clarification flows cannot depend on it yet.
- There is no direct exec/fs bridge; the current path is via CLI subprocesses and adapter APIs, so arbitrary shell/filesystem control stays out of scope.

## Verification evidence

- Current Codex adapter capabilities are implemented in `src-server/providers/adapters/codex-adapter.ts`.
- Targeted repo inspection across `src-server/`, `src-ui/`, and `packages/` found no Phase 1-safe support for fork handling, `request-user-input`, or a direct exec/fs bridge.

## Step 5 gate

- The approved coding-surface plan's Step 5 is still a Phase 2 item.
- `docs/strategy/roadmap.md` still marks Phase 2 as queued until Phase 1 closes, so Step 5 remains blocked in this Ralph lane unless roadmap state changes.
