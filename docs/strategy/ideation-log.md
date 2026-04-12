# Ideation Log

> Running log of ideation sessions, competitive insights, and feature ideas. Append new entries at the top. Each entry should note the date, source, and outcome.

---

## 2026-04-11: Phase 1 Hardening Ideation

**Source:** `.claude/commands/ideate.md` workflow + Stallion code audit + repo/docs review of openai/codex, nousresearch/hermes-agent, badlogic/pi-mono, pingdotgg/t3code, happier-dev/happier

**Focus:** Onboarding, provider abstraction, runtime adapters, first-run experience

**Key insights:**

1. **Stallion already has a partial multi-provider story, but first-run still routes through Bedrock assumptions.**
   - `packages/contracts/src/provider.ts` keeps `ProviderKind` as `'bedrock' | 'claude' | 'codex'`
   - `packages/contracts/src/config.ts` still requires `AppConfig.region`
   - `src-server/runtime/runtime-startup.ts` only seeds a default provider connection when Bedrock creds exist
   - `src-server/runtime/runtime-default-agent.ts` always creates the default agent via `createBedrockModel(...)`
   - `README.md` still positions Stallion as "Built on Amazon Bedrock" and requires AWS credentials

2. **Pi-mono has the cleanest provider abstraction pattern to steal for Phase 1.**
   - `packages/ai/src/providers/register-builtins.ts` registers providers through a registry instead of a router switch
   - Providers are lazy-loaded, reducing startup coupling and making new providers additive
   - `packages/ai/README.md` explicitly supports "Any OpenAI-compatible API" and documents custom model/provider wiring cleanly
   - `packages/coding-agent/src/core/model-resolver.ts` picks defaults per provider, resolves models flexibly, and falls back gracefully when a configured model is missing

3. **Hermes has the best setup-wizard shape for "detect, configure, validate, activate".**
   - `hermes_cli/memory_setup.py` auto-detects installed providers, shows an interactive picker, installs missing deps, writes config + `.env`, and exposes `status`
   - `website/docs/developer-guide/context-engine-plugin.md` uses strict plugin interfaces plus config-driven activation, with one active engine selected explicitly
   - `website/docs/user-guide/features/memory-providers.md` documents a very clear "built-in only" default plus additive external providers
   - This is a strong template for `./stallion doctor` + first-run provider selection + adapter/plugin activation

4. **Codex proves the right first-run sequencing: install -> run -> auth later, not cloud credential gate first.**
   - `README.md` pushes a one-command quickstart and defers authentication choice to runtime
   - `codex-rs/core/config.schema.json` exposes extensible `model_providers`, `oss_provider`, approval reviewer options, and provider config as data rather than hard-coded branches
   - The onboarding lesson is not "copy Codex auth", but "make startup independent from one vendor and let capabilities unlock incrementally"

5. **T3Code is useful as a cautionary baseline: minimal setup, but still explicit about provider prerequisites.**
   - `README.md` makes provider requirements obvious up front and names the exact auth commands
   - `apps/server/src/cli.ts` centralizes startup config precedence (flags/env/bootstrap), supports headless mode, and has auto-bootstrap controls
   - Worth stealing: startup config precedence and bootstrap envelopes; not worth copying: thin provider abstraction

6. **Happier has the best backend/settings UX patterns for mixed runtimes.**
   - `apps/docs/content/docs/features/permissions.mdx` shows provider-agnostic permission intents plus an "Effective" line when provider support differs
   - `apps/docs/content/docs/features/mcp-servers.mdx` uses configured/detected/preview tabs to show saved defaults, imported provider-native config, and effective runtime state
   - `apps/docs/content/docs/clients/cli-sessions.mdx` treats actions/session control as a canonical catalog reused across surfaces
   - Stallion should steal the "effective runtime state" UX for providers, adapters, and tools, especially in Connections/Doctor

**Recommendations:**

1. **Replace Bedrock-first startup with provider detection + default selection** — `medium`
   - Add a startup detector that checks: Bedrock creds, Ollama reachability, configured OpenAI-compatible providers, Claude/Codex runtime prerequisites, ACP connections
   - Seed the first default provider connection from the best available detected option instead of only Bedrock
   - File hints: `src-server/runtime/runtime-startup.ts`, `src-server/routes/system.ts`, `packages/cli/src/commands/lifecycle.ts`

2. **Split provider identity from runtime identity and make both extensible** — `large`
   - Change `ProviderKind` to extensible string + exported well-known constants
   - Replace hard-coded runtime capability/name maps with adapter metadata so plugins can add runtimes cleanly
   - File hints: `packages/contracts/src/provider.ts`, `src-server/providers/adapter-shape.ts`, `src-server/services/connection-service-helpers.ts`

3. **Kill the `llm-router` switch and move model-provider creation behind a registry** — `medium`
   - Follow the Pi pattern: register built-ins on boot, allow lazy factories, and support OpenAI-compatible/Ollama/custom endpoints without more `switch` growth
   - File hints: `src-server/services/llm-router.ts`, `src-server/providers/connection-factories.ts`, `src-server/providers/registry.ts`

4. **Make runtime adapter registration truly registry-driven** — `medium`
   - `runtime-initialize.ts` already registers adapters, but `stallion-runtime.ts` still constructs Bedrock/Claude/Codex adapters directly and the contracts still assume the fixed set
   - Move adapter discovery/registration behind plugin assets or config so Ollama and future adapters can register without touching runtime core
   - File hints: `src-server/runtime/stallion-runtime.ts`, `src-server/runtime/runtime-initialize.ts`, `src-server/runtime/runtime-initialize-deps.ts`

5. **Build a real first-run wizard, not just a dismissible setup banner** — `medium`
   - Current `OnboardingGate.tsx` only shows "Manage Connections"
   - Replace with a flow that shows detected providers, recommended default, missing prerequisites, and "start with built-in/local only" paths
   - File hints: `src-ui/src/components/OnboardingGate.tsx`, `src-ui/src/views/provider-settings/ProviderConnectionForm.tsx`, `src-server/routes/system.ts`

6. **Upgrade `./stallion doctor` from machine-prereq check to provider/runtime health report** — `small`
   - Include provider detection, missing env vars, missing CLIs, runtime adapter prerequisites, and actionable fix commands
   - Follow Hermes `status` and Happier preview/effective-state patterns
   - File hints: `packages/cli/src/commands/lifecycle.ts`, `src-server/routes/system.ts`

7. **Decouple the default agent from Bedrock so first chat works on whatever was detected** — `medium`
   - The default agent should choose the detected default runtime/model pair, not assume Bedrock model creation
   - File hints: `src-server/runtime/runtime-default-agent.ts`, `src-server/runtime/runtime-provider-resolution.ts`, `src-server/routes/chat.ts`

8. **Add an "effective runtime" surface in the UI** — `small`
   - Show configured vs detected vs active runtime/provider/tool state, including why a backend is unavailable
   - This should cover model providers, runtime adapters, ACP, and MCP/tool surfaces
   - File hints: `src-ui/src/views/provider-settings/*`, `src-ui/src/hooks/useSystemStatus.ts`

**Outcome:** Phase 1 should prioritize three steals in order: Pi's registry-based provider factories, Hermes's detect/configure/status wizard flow, and Happier's effective-state UX. Codex is most useful as a sequencing lesson: startup must succeed before auth depth.

**Next:** Execute Phase 1a/1b together: extensible provider/runtime contracts + registry-based provider factories, then build the wizard/doctor flow on top of that capability graph.

## 2026-04-11: Initial Strategy Session

**Source:** Deep codebase audit + competitive research against openai/codex, nousresearch/hermes-agent, badlogic/pi-mono, pingdotgg/t3code, happier-dev/happier

**Key insights:**

1. **The AI <-> UI bridge is the SDK layer today** -- not dynamic UI generation. The real bridge is plugin layouts using SDK hooks (useAgents, useSendToChat, callTool, searchKnowledge, etc.) to build vertical workspaces that seed context to AI. stallion-control MCP is the most novel part (agents managing agents). Vision: evolve toward structured UI blocks in chat and auto-context capture.

2. **Hermes Agent (58K stars) validates our direction** -- their self-improving skill loop (agents create skills from experience), subagent delegation with isolation rules, and pluggable memory providers are patterns Stallion should adopt. Their prompt injection defense for context files is a security gap we need to close.

3. **Bedrock gate is the #1 adoption blocker** -- ProviderKind is hard-coded, AppConfig.region is required, BUILTIN_SOURCES is fixed. Non-AWS users can't use Stallion out of the box. This must be Phase 1.

4. **Plugin ecosystem needs bootstrapping** -- architecture is excellent (16+ provider types, additive/singleton cardinality) but no community plugins exist. Need: create-plugin scaffolding, curated starters, hosted registry, frictionless tutorial.

5. **Positioning: hybrid** -- don't narrow to "IDE" or "enterprise shell" or "agent platform" yet. Build the primitives that serve all three. Plugin system is what makes one platform serve individuals, teams, and organizations.

**Outcome:** Created docs/strategy/ with constitution, differentiators, competitive landscape, roadmap (5 phases), execution pattern, and AI-UI bridge vision. Defined 4 ideation skills. Established execution pattern for multi-AI work.

**Next:** Execute Phase 0 remaining items (skills), then begin Phase 1 (Harden & Onboard).
