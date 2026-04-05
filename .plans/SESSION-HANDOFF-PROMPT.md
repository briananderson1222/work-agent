# Session Handoff Prompt

Use this prompt to bring the Connected Agents Overhaul into a fresh session
without losing the architecture boundary or wasting context on rediscovery.

## Prompt

```md
You are continuing work on Stallion's Connected Agents Overhaul in:
`/Users/brian/dev/github/briananderson1222/work-agent`

Before making any edits:

1. Read `.plans/01-connected-agents-overhaul.md`
2. Read `.plans/03-connections-runtime-ux.md`
3. Treat `01` as the architecture source of truth and `03` as the UX /
   application-layer plan that must sit on top of `01`

Core architectural rule:

- Native runtime owns behavior; Stallion owns abstraction and presentation
- Claude/Codex native implementations should own provider-native semantics such
  as approvals, interrupts, resume, thread/session semantics, rollback, tool
  loop behavior, and provider-specific options
- Stallion adapters should translate native runtime events into canonical
  runtime/orchestration events
- Stallion orchestration should own command routing, receipts, persistence,
  replay, read models, and UI-facing session state
- Stallion UI should render a consistent experience from orchestration state,
  not invent a parallel execution state machine

Guardrails:

- Do not flatten Claude/Codex into generic low-fidelity model providers
- Do not let provider-native APIs leak directly through the app
- Do not add UI-only execution truth that bypasses orchestration
- Do not turn Connections into a second orchestration system; it is a
  projection/configuration surface
- Keep agent execution settings subordinate to the canonical orchestration and
  adapter model

Execution approach:

1. Audit the current implementation against the guardrails in `01` and `03`
2. Identify mismatches between:
   - native runtime behavior
   - shared adapter contract
   - orchestration/read-model ownership
   - UI state ownership
3. Produce a short implementation plan before editing code
4. Make the smallest coherent set of changes that moves the codebase toward the
   target architecture
5. Run the required verification gates before declaring completion

Recommended parallel read-only discovery:

- One thread/agent inspects the local Stallion adapter/orchestration code
- One thread/agent inspects the local UI/runtime-state surfaces
- One thread/agent inspects the reference implementation in
  `/Users/brian/dev/github/pingdotgg/t3code`
- Keep those tasks read-only and bounded
- Centralize synthesis, decisions, and file edits in one place so the
  architecture does not drift

Suggested files to inspect early:

- `.plans/01-connected-agents-overhaul.md`
- `.plans/03-connections-runtime-ux.md`
- `src-server/providers/`
- `src-server/orchestration/`
- `src-server/runtime/`
- `src-server/routes/`
- `src-ui/src/components/ChatDock.tsx`
- `src-ui/src/components/ChatSettingsPanel.tsx`
- `src-ui/src/views/ConnectionsHub.tsx`
- `/Users/brian/dev/github/pingdotgg/t3code/apps/server/src/provider/Services/ProviderAdapter.ts`
- `/Users/brian/dev/github/pingdotgg/t3code/apps/server/src/provider/Services/ClaudeAdapter.ts`
- `/Users/brian/dev/github/pingdotgg/t3code/apps/server/src/provider/Services/CodexAdapter.ts`
- `/Users/brian/dev/github/pingdotgg/t3code/apps/server/src/orchestration/Services/OrchestrationEngine.ts`
- `/Users/brian/dev/github/pingdotgg/t3code/apps/server/src/orchestration/Services/ProviderCommandReactor.ts`

Completion gates:

- `npx biome check src-server/ src-ui/ packages/`
- `npx tsc --noEmit`
- `npm test`
- If UI changes, run a manual smoke test or a Playwright spec against a unique
  Stallion port pair

When you report back:

- Start with architectural mismatches or confirmed alignment
- Then summarize code changes
- Then summarize verification results
- Call out any remaining drift from the target plan explicitly
```

## Notes

- Use this prompt for fresh sessions, handoffs, and bounded parallel discovery.
- If the work is specifically architectural, re-read `01` even if it was read
  recently.
- If the work is specifically Connections/runtime UX, re-read `03` after `01`,
  not instead of it.
