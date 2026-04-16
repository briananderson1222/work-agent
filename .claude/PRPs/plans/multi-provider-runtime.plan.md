# Multi-Provider Runtime Plan

**Status:** In Progress
**Branch:** feat/codex-convergence
**Last updated:** 2026-04-15

---

## Progress Update (2026-04-15)

### Completed in this branch

- Upgraded `@strands-agents/sdk` to `1.0.0-rc.3` so the runtime can use the published `VercelModel` bridge. This required `--legacy-peer-deps` because the repo still pins `zod` 3.x while newer Strands releases declare a `zod` 4 peer.
- Upgraded the VoltAgent compatibility stack to current published versions: `ai` `6.0.161`, `@voltagent/core` `2.7.0`, `@voltagent/server-hono` `2.0.9`, `@voltagent/logger` `2.0.2`, `@voltagent/libsql` `2.1.2`, and `@voltagent/cli` `0.1.21`. This was required to make managed VoltAgent flows accept the newer AI SDK model surface.
- Managed framework model creation is now provider-aware through the existing Stallion connection model. Managed agents resolve `execution.modelConnectionId` first, then `defaultLLMProvider`, then the first enabled LLM connection instead of defaulting to Bedrock.
- `VoltAgentFramework` and `StrandsFramework` now resolve model IDs through the selected managed model connection. `bedrock`, `openai-compat`, and `ollama` model connections are wired through the shared managed-runtime bridge.
- `BedrockAdapter` now performs real streaming generation and publishes canonical `content.text-delta` events even when it is instantiated without custom callbacks. It also exposes `listModels()`.
- Orchestration routes now expose `GET /providers/:provider/models` for runtime-level model discovery.
- Existing connected integrations were relabeled to `Claude Code` and `Codex` in the user-facing adapter/UI label layer.

### Still open

- Additional direct orchestration adapters from Phase C (`openai`, `groq`, `litellm`, `anthropic-direct`) are not implemented yet.
- Dedicated provider-selection UX from Phase D is still partial. The current UI can select managed model connections and consume runtime catalogs, but it does not have the planned provider-family selector flow.
- Credential storage and provider settings work from Phase E is still pending.

### Verification evidence

- `npx tsc --noEmit`
- `npx biome check src-server/ src-ui/ packages/`
- `npm test`
- Added a dedicated VoltAgent managed-provider proof in `src-server/runtime/__tests__/voltagent-adapter.test.ts` covering `openai-compat` and `ollama` managed model connections.

## Context

Stallion currently supports two execution paths:

| Path | Purpose | Files |
|------|---------|-------|
| **Framework agents** | Full agentic loop (tools, MCP, streaming, memory) | `voltagent-adapter.ts`, `strands-adapter.ts` |
| **Orchestration adapters** | Direct runtime chat (session lifecycle, SSE events) | `providers/adapters/bedrock-adapter.ts`, `claude-adapter.ts`, `codex-adapter.ts`, `ollama-adapter.ts` |

**Current gaps:**
- Both `VoltAgentFramework.createModel()` and `StrandsFramework.createModel()` are **hardwired to Bedrock** — they ignore `AppConfig.defaultLLMProvider` and `AgentSpec.provider`
- Framework agents cannot use Anthropic Claude, OpenAI, Groq, Mistral, Google, or LiteLLM
- Only 4 orchestration providers are registered (Bedrock, Claude SDK, Codex CLI, Ollama)

---

## Key Finding: Framework Convergence via Vercel AI SDK

Both frameworks can share a single provider factory:

- **VoltAgent** already uses `@ai-sdk/*` (e.g. `@ai-sdk/amazon-bedrock`) — model objects are `LanguageModelV1`
- **Strands** has `VercelModel` in `@strands-agents/sdk` — wraps any `LanguageModelV3` from `@ai-sdk/provider`

Since all `@ai-sdk/*` packages implement both `LanguageModelV1` and `LanguageModelV3` (they share the same underlying object), a **unified factory** can produce a model and each adapter consumes it:

```
createLLMProvider(spec, appConfig)
       │
       ├─→ VoltAgent: use model directly (LanguageModelV1)
       └─→ Strands: wrap in new VercelModel({ provider: model })
```

This means one provider registry covers both frameworks.

---

## Provider Coverage Target

### Framework agents (VoltAgent + Strands)

| Provider | Package | Auth |
|----------|---------|------|
| AWS Bedrock | `@ai-sdk/amazon-bedrock` | AWS credentials (existing) |
| Anthropic | `@ai-sdk/anthropic` | `ANTHROPIC_API_KEY` |
| OpenAI | `@ai-sdk/openai` | `OPENAI_API_KEY` |
| Groq | `@ai-sdk/groq` | `GROQ_API_KEY` |
| Mistral | `@ai-sdk/mistral` | `MISTRAL_API_KEY` |
| Google AI Studio | `@ai-sdk/google` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Google Vertex | `@ai-sdk/google-vertex` | GCP credentials |
| xAI (Grok) | `@ai-sdk/xai` | `XAI_API_KEY` |
| Cohere | `@ai-sdk/cohere` | `COHERE_API_KEY` |
| LiteLLM proxy | `@ai-sdk/openai` (custom baseURL) | Configurable |
| Ollama | `ollama-ai-provider` | Local — no key |

### Orchestration adapters (Runtime Chat)

| Provider | Status | Notes |
|----------|--------|-------|
| Bedrock | ✅ exists | Needs LLM output fix (see Phase B) |
| Claude SDK | ✅ exists | Connected runtime |
| Codex CLI | ✅ exists | Connected runtime |
| Ollama | ✅ exists (2026-04-14) | Direct LLM chat |
| OpenAI | Phase C | Direct API |
| Anthropic | Phase C | Direct API (or reuse claude-adapter) |
| Groq | Phase C | OpenAI-compatible |
| LiteLLM | Phase C | OpenAI-compatible base URL |

---

## Implementation Phases

### Phase A: Unified Provider Factory for Framework Agents

**Goal:** Make `createModel()` in both adapters provider-aware.

#### A1 — Contracts & config schema

- Add `provider?: string` to `AgentSpec` in `packages/contracts/src/agent.ts`
- Add `defaultLLMProvider?: string` to `AppConfig` in `packages/contracts/src/config.ts`
- Provider string format: `bedrock`, `anthropic`, `openai`, `groq`, `mistral`, `google`, `vertex`, `xai`, `cohere`, `litellm`, `ollama`

#### A2 — Unified provider factory

Create `src-server/providers/llm-provider-factory.ts`:

```typescript
export interface LLMProviderOptions {
  provider: string;          // 'bedrock' | 'anthropic' | 'openai' | ...
  modelId: string;
  appConfig: AppConfig;
  projectHomeDir: string;
  modelCatalog?: BedrockModelCatalog;
  // provider-specific overrides (apiKey, baseURL, region, etc.)
  providerOptions?: Record<string, unknown>;
}

export function createLLMProvider(opts: LLMProviderOptions): LanguageModelV1 {
  switch (opts.provider) {
    case 'bedrock':
      return createBedrockProvider({ appConfig: opts.appConfig, agentSpec: { model: opts.modelId } });
    case 'anthropic':
      return createAnthropic({ apiKey: resolveKey('ANTHROPIC_API_KEY', opts) })(opts.modelId);
    case 'openai':
      return createOpenAI({ apiKey: resolveKey('OPENAI_API_KEY', opts) })(opts.modelId);
    case 'groq':
      return createGroq({ apiKey: resolveKey('GROQ_API_KEY', opts) })(opts.modelId);
    case 'mistral':
      return createMistral({ apiKey: resolveKey('MISTRAL_API_KEY', opts) })(opts.modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: resolveKey('GOOGLE_GENERATIVE_AI_API_KEY', opts) })(opts.modelId);
    case 'ollama':
      return createOllama()(opts.modelId);
    case 'litellm':
      return createOpenAI({ baseURL: opts.providerOptions?.baseURL as string })(opts.modelId);
    default:
      throw new Error(`Unknown LLM provider: ${opts.provider}`);
  }
}
```

#### A3 — Wire into VoltAgentFramework.createModel()

```typescript
// voltagent-adapter.ts
async createModel(spec: AgentSpec, config: AgentCreationConfig): Promise<any> {
  const provider = spec.provider ?? config.appConfig.defaultLLMProvider ?? 'bedrock';
  const resolvedModel = await resolveConfiguredModelId(spec, config);
  return createLLMProvider({ provider, modelId: resolvedModel, appConfig: config.appConfig, ... });
}
```

#### A4 — Wire into StrandsFramework.createModel()

```typescript
// strands-adapter.ts
async createModel(spec: AgentSpec, config: AgentCreationConfig): Promise<any> {
  const provider = spec.provider ?? config.appConfig.defaultLLMProvider ?? 'bedrock';
  if (provider === 'bedrock') {
    // Keep native BedrockModel for Bedrock (no Vercel overhead)
    const resolvedModel = await resolveConfiguredModelId(spec, config);
    return new BedrockModel({ modelId: resolvedModel, region: ... });
  }
  const resolvedModel = await resolveConfiguredModelId(spec, config);
  const vercelModel = createLLMProvider({ provider, modelId: resolvedModel, ... });
  return new VercelModel({ provider: vercelModel });
}
```

#### A5 — Install packages

```bash
npm install @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/groq @ai-sdk/mistral @ai-sdk/google @ai-sdk/xai @ai-sdk/cohere ollama-ai-provider
```

---

### Phase B: Fix BedrockAdapter LLM Output

**Problem:** `BedrockAdapter` in `providers/adapters/bedrock-adapter.ts` is instantiated in `stallion-runtime.ts` with no callbacks — `sendTurn()` returns `undefined` and publishes no `content.text-delta` events. The Runtime Chat for Bedrock shows nothing.

**Fix:** Audit `BedrockAdapter.sendTurn()` to ensure it invokes the underlying LLM and publishes streaming events. This likely means wiring `BedrockAdapter` to the `OllamaLLMProvider`-style pattern: directly call the Bedrock Converse streaming API and publish `content.text-delta` per chunk.

Reference: `OllamaAdapter.sendTurn()` in `providers/adapters/ollama-adapter.ts` — correct pattern.

---

### Phase C: Additional Orchestration Adapters

New adapters in `src-server/providers/adapters/`:

#### C1 — OpenAI adapter (`openai-adapter.ts`)

- `provider: 'openai'`, `runtimeId: 'openai-runtime'`, `executionClass: 'managed'`
- Uses `@ai-sdk/openai` or raw `openai` SDK for streaming
- `listModels()` calls `/v1/models` filtered to GPT/o-series
- `getPrerequisites()` checks `OPENAI_API_KEY` env var

#### C2 — Anthropic adapter (`anthropic-direct-adapter.ts`)

- `provider: 'anthropic-direct'`, `runtimeId: 'anthropic-direct-runtime'`
- Note: `claude-adapter.ts` wraps the Claude CLI — this would be the direct API
- Uses `@ai-sdk/anthropic` for streaming
- `listModels()` returns known claude-3/4 model list (API has no list endpoint)

#### C3 — Groq adapter (`groq-adapter.ts`)

- `provider: 'groq'`, `runtimeId: 'groq-runtime'`
- OpenAI-compatible — can extend OpenAI adapter with different base URL
- `listModels()` calls Groq `/openai/v1/models`

#### C4 — LiteLLM adapter (`litellm-adapter.ts`)

- `provider: 'litellm'`, `runtimeId: 'litellm-runtime'`
- OpenAI-compatible with configurable `baseURL` from `AppConfig` or env
- Routes any model string through LiteLLM proxy

**Registration** (in `stallion-runtime.ts`):
```typescript
registerProviderAdapters([
  bedrockAdapter,
  claudeAdapter,
  codexAdapter,
  ollamaAdapter,
  openAIAdapter,      // Phase C1
  groqAdapter,        // Phase C3
  liteLLMAdapter,     // Phase C4
]);
```

---

### Phase D: UI Provider Selector

**In agent editor** (managed agents only):

- New "Provider" field in agent Basic tab — dropdown of available providers
- Per-provider model picker — fetches `GET /orchestration/providers/:provider/models`
- Persists `agent.provider` and `agent.model` to AgentSpec

**In New Chat modal:**

- Provider sections group runtime connections by provider family
- Show `listModels()` results for each connected runtime
- Merge Ollama, OpenAI, Groq, etc. into organized groups

---

### Phase E: Credential Management

**Storage:** `~/.stallion-ai/credentials.json` (encrypted at rest)

**API:**
- `GET /api/credentials` — list configured providers (keys redacted)
- `PUT /api/credentials/:provider` — set API key
- `DELETE /api/credentials/:provider` — clear key

**UI:** Settings → Providers page — one row per provider with key input + test button

**Resolution order for API keys:**
1. `AgentSpec.providerOptions.apiKey` (per-agent override)
2. `credentials.json` (user-configured)
3. Environment variable (e.g. `OPENAI_API_KEY`)
4. Error if none found

---

## Execution Order

```
Phase B (immediate) → Phase A1-A2 → Phase A3-A4 → Phase A5
                                                         ↓
                                                    Phase C1-C4
                                                         ↓
                                                    Phase D + E (parallel)
```

Phase B first because it fixes a currently broken feature (Bedrock Runtime Chat shows no output).

---

## Non-Goals (out of scope)

- Per-agent billing / usage tracking per provider (tracked separately)
- Streaming tool calls through non-Bedrock orchestration adapters
- Fine-tuned model management
- Self-hosted Anthropic / OpenAI-compatible endpoints other than LiteLLM (those use Phase C4)

---

## Open Questions

1. **Strands VercelModel version compatibility**: Does `@strands-agents/sdk` ship `VercelModel` in the version currently installed? Check `node_modules/@strands-agents/sdk/dist/models/vercel*` before Phase A4.
2. **`AppConfig.defaultLLMProvider` field name**: Confirm it exists in `packages/contracts/src/config.ts` or add it in Phase A1.
3. **Bedrock adapter LLM path**: Does `BedrockAdapter` call the Bedrock Converse API directly or delegate to the VoltAgent framework? Need to audit before Phase B.
