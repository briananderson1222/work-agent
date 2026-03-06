# Strands SDK Integration — Remaining Work

## Context for New Session

You're continuing work on **Project Stallion** (`~/dev/gitlab/stallion-workspace/stallion-new`), a local-first AI agent system. Tonight we:

1. Researched the Strands TS SDK (v0.5.0, AWS's agent framework) as a replacement for VoltAgent + Vercel AI SDK
2. Built a framework-agnostic abstraction layer (interfaces, adapters, shared hooks)
3. Created a Strands adapter that runs behind a `"runtime": "strands"` config flag
4. Verified basic chat streaming works with both runtimes (identical SSE event types)
5. Merged everything to main and pushed to both remotes

### Architecture (already built)

```
stallion-runtime.ts          — Framework-agnostic orchestrator
runtime/types.ts             — IAgent, ITool, IStreamChunk, IMemory, IAgentHooks, AgentBundle, IAgentFramework
runtime/agent-hooks.ts       — Shared business logic: approval, usage/cost, message enrichment
runtime/voltagent-adapter.ts — VoltAgent adapter (implements IAgentFramework)
runtime/strands-adapter.ts   — Strands adapter (implements IAgentFramework, stream mapping, hook wiring)
adapters/file/memory-adapter.ts — File-based conversation persistence (renamed from voltagent-memory-adapter)
utils/logger.ts              — Centralized logger (re-exports @voltagent/logger for now)
```

The runtime selects adapter based on `appConfig.runtime`:
```typescript
this.framework = runtime === 'strands' ? new StrandsFramework() : new VoltAgentFramework();
```

### What's Verified Working
- Server starts with both runtimes
- `/runtime` endpoint returns correct framework name
- `/api/agents` returns agents (both runtimes)
- MCP tools load via Strands McpClient (156 tools)
- `/agents/:slug/invoke` returns correct response (both runtimes)
- `/invoke` endpoint works (both runtimes)
- Streaming chat produces identical event types (text-delta, start, start-step, text-start, text-end, finish-step, finish, [DONE])

---

## CRITICAL: Dependency & Config Issues

The stash merge overwrote `package.json` and `schemas/app.schema.json`. These need fixing FIRST:

### Task 0A: Add @strands-agents/sdk to package.json
```bash
cd ~/dev/gitlab/stallion-workspace/stallion-new
npm install @strands-agents/sdk --save --legacy-peer-deps
```
Also need OpenTelemetry compat deps (Strands SDK requires them):
```bash
npm install @opentelemetry/resources@1.30.1 @opentelemetry/sdk-trace-base@1.30.1 @opentelemetry/sdk-trace-node@1.30.1 @opentelemetry/api@1.9.0 --save --legacy-peer-deps
```

### Task 0B: Add `runtime` field to schemas/app.schema.json
Add to the properties object:
```json
"runtime": {
  "type": "string",
  "enum": ["voltagent", "strands"],
  "description": "Agent framework runtime. Default: voltagent",
  "default": "voltagent"
}
```
Also ensure `"additionalProperties": true` (not false) since user configs may have extra fields like `gitRemote`.

---

## Verification Tasks (test with actual Bedrock calls)

### Task 1: Tool execution during Strands chat
Set `"runtime": "strands"` in `~/.stallion-ai/config/app.json`. Send a chat message that triggers a tool call (e.g., ask the agent to search email or check calendar — whatever MCP tools are available). Verify:
- Tool call events appear in the SSE stream (`tool-call`, `tool-result`)
- The tool actually executes (check server logs for "Strands MCP tools" entries)
- The response incorporates tool results

### Task 2: Tool approval flow
Send a chat that triggers a tool NOT in the agent's `autoApprove` list. Verify:
- A `tool-approval-request` event appears in the SSE stream
- The `/tool-approval/:approvalId` endpoint accepts/rejects
- Approved tools execute; denied tools return a denial message to the LLM

The approval wiring is in `stallion-runtime.ts` around line ~1900 where `agentHooks.requestApproval` is set from the elicitation callback. The Strands adapter wires this via `strandsAgent.hooks.addCallback(BeforeToolCallEvent, ...)`.

### Task 3: Conversation persistence with Strands
After a Strands chat, verify:
- Messages are saved to `~/.stallion-ai/agents/<slug>/memory/conversations/`
- The conversation appears in the UI's conversation list
- Reloading the page shows the conversation history

The Strands adapter syncs messages in the `AfterInvocationEvent` hook (strands-adapter.ts ~line 305). It diffs `agent.messages` against what's persisted and writes the delta.

### Task 4: Usage stats after Strands chat
After a Strands chat, hit `GET /agents/:slug/conversations/:conversationId/stats`. Verify:
- `inputTokens` and `outputTokens` are non-zero
- `estimatedCost` is a number or null (not 0)
- `turns` increments correctly

Usage is captured from `agentResultEvent.metrics.usage` in the stream wrapper (strands-adapter.ts ~line 170) and from the `AfterInvocationEvent` hook.

### Task 5: Model override chat
Send a chat with `options.model` set to a different model ID. This was returning empty in testing. Debug:
- Check if `this.framework.createTempAgent()` is called (stallion-runtime.ts ~line 1791)
- Check if the Strands `BedrockModel` accepts the model ID format
- The `(tempWrapper as any).raw` fallback returns undefined for Strands agents — verify the agent is still usable without `.raw`

### Task 6: Re-integrate telemetry spans
The stashed scheduler work added OTel spans and metrics to the chat handler:
- `chatSpan = tracer.startSpan('stallion.chat', ...)`
- `chatRequests.add(1, ...)`, `chatDuration.record(...)`, `tokensInput.add(...)`, `tokensOutput.add(...)`
- `chatSpan.setStatus(...)`, `chatSpan.end()`

These were lost during conflict resolution (we took our version of stallion-runtime.ts). The telemetry imports are already in the file:
```typescript
import { chatRequests, chatDuration, chatErrors, tokensInput, tokensOutput, registerObservableGauges } from '../telemetry/metrics.js';
```
But the actual span/metric calls in the chat handler need to be re-added. Check the git history for the stash's version of the chat handler and port the telemetry calls.

### Task 7: Usage tracking in invoke path
`StrandsAgentWrapper.generateText()` returns `{ promptTokens: 0, completionTokens: 0 }` because `agent.invoke()` doesn't expose metrics. Fix: either use `agent.stream()` internally and consume it, or register an `AfterInvocationEvent` hook that captures metrics and stashes them on the wrapper.

### Task 8: Playwright E2E tests
Run the full Playwright suite against both runtimes:
```bash
# VoltAgent (default)
npm run dev:server & npm run dev:ui &
npx playwright test

# Strands
# Set "runtime": "strands" in app.json first
npm run dev:server & npm run dev:ui &
npx playwright test
```

---

## Parallelization Strategy

**Wave 1 (independent, run in parallel):**
- Task 0A + 0B: Fix deps and schema (one subagent)
- Task 6: Re-integrate telemetry (one subagent — reads git history, ports span calls)
- Task 7: Fix invoke usage tracking (one subagent — modifies strands-adapter.ts only)

**Wave 2 (after Wave 1, needs working server):**
- Tasks 1-5: Verification tests (sequential — each needs server running with Strands)

**Wave 3 (after Wave 2):**
- Task 8: Playwright E2E

---

## Key Files Reference

| File | Purpose | Lines |
|---|---|---|
| `src-server/runtime/stallion-runtime.ts` | Main orchestrator, route definitions, chat handler | ~2800 |
| `src-server/runtime/strands-adapter.ts` | Strands SDK adapter, stream mapping, hook wiring | ~400 |
| `src-server/runtime/voltagent-adapter.ts` | VoltAgent adapter | ~200 |
| `src-server/runtime/agent-hooks.ts` | Shared hooks: approval, stats, cost, enrichment | ~200 |
| `src-server/runtime/types.ts` | IAgent, ITool, IStreamChunk, IAgentHooks, IAgentFramework | ~180 |
| `src-server/runtime/tool-executor.ts` | VoltAgent-specific hooks (legacy, being replaced) | ~530 |
| `src-server/runtime/stream-orchestrator.ts` | SSE pipeline setup, elicitation callback | ~190 |
| `src-server/runtime/streaming/` | Stream handlers (reasoning, text, tool, metadata, completion) | ~400 |
| `schemas/app.schema.json` | App config JSON schema (needs `runtime` field) | ~100 |
| `~/.stallion-ai/config/app.json` | User's app config (add `"runtime": "strands"` to test) | — |

## How to Switch Runtimes
```bash
# Edit ~/.stallion-ai/config/app.json
# Add: "runtime": "strands"
# Or remove/set to "voltagent" for default

# Verify:
curl http://localhost:3141/runtime
# → {"runtime":"strands"} or {"runtime":"voltagent"}
```
