# Differentiation Check

Audit the codebase against `docs/strategy/differentiators.md` to verify that claimed capabilities actually exist in code. Report gaps between narrative and reality.

## Instructions

1. **Read differentiators doc:**
   - Read `docs/strategy/differentiators.md` thoroughly
   - Note every capability claimed under "What exists today" for each tier

2. **Verify each claim against the codebase:**

   For **Tier 1.1 (Plugin-Powered Vertical Surfaces)**:
   - Grep for SDK hook exports: `useAgents`, `useSendToChat`, `callTool`, `searchKnowledge`, etc.
   - Verify `contextRegistry` exists and is functional
   - Check example plugins actually build and work
   - Verify `stallion dev` hot-reload works

   For **Tier 1.2 (Self-Configuring Platform)**:
   - Verify `stallion-control` MCP server exists with claimed tools
   - Test: can an agent actually create another agent? Install an integration?
   - Check that navigation tool works

   For **Tier 1.3 (Any Runtime, One UI)**:
   - Verify all three adapter types exist (bedrock, claude, codex)
   - Check `CanonicalRuntimeEvent` normalization
   - Verify `OrchestrationService` manages cross-provider sessions
   - Check if `ProviderKind` is still hard-coded (gap) or has been made extensible

   For **Tier 2 and table stakes**: similar verification

3. **Report gaps:**
   - For each claim that doesn't match reality, note:
     - What's claimed
     - What actually exists (with file paths and line numbers)
     - Severity: Critical (differentiator is fake), Medium (partially true), Low (minor gap)
   - For each claim that IS true, confirm with file path evidence

4. **Update docs if needed:**
   - If gaps found, update `docs/strategy/differentiators.md` to be honest
   - If new capabilities have been built since last update, add them

5. **Output format:**
   ```
   ## Differentiation Audit — [date]

   ### Verified (exists in code)
   - [Claim]: [file:line evidence]

   ### Gaps (claimed but missing or incomplete)
   - [Claim]: [what's actually there] — Severity: [Critical/Medium/Low]

   ### New (exists but not documented)
   - [Capability]: [file:line evidence]
   ```

Run this after major feature work to keep the differentiators doc honest.
