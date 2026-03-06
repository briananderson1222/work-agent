# Backend Patterns

> **For AI Agents**: If you encounter a pattern not documented here, add it after implementing. This file is the source of truth for backend conventions.

## Architecture Overview

```
src-server/
├── runtime/             # VoltAgent runtime integration
│   ├── streaming/       # Streaming handlers
│   └── stallion-runtime.ts  # Core runtime (should be minimal)
├── routes/              # HTTP route handlers
│   ├── agents.ts
│   ├── tools.ts
│   ├── workspaces.ts
│   ├── analytics.ts
│   ├── monitoring.ts
│   ├── bedrock.ts
│   ├── config.ts
│   └── conversations.ts
├── services/            # Business logic services
│   ├── agent-service.ts
│   ├── mcp-service.ts
│   └── workspace-service.ts
├── adapters/            # Storage adapters
├── providers/           # LLM providers (Bedrock)
├── domain/              # Types and config loading
├── analytics/           # Usage tracking
└── utils/               # Utility functions
```

## Refactoring Principles

The backend is being refactored from a monolithic `stallion-runtime.ts` (~3,800 lines) to a layered architecture. Follow these principles:

### 1. Routes Handle HTTP Only

Routes should:
- Parse request parameters
- Call service methods
- Format HTTP responses
- Handle HTTP-specific errors

Routes should NOT:
- Contain business logic
- Access storage directly
- Manage state

### 2. Services Contain Business Logic

Services should:
- Implement business rules
- Coordinate between adapters
- Handle domain-specific errors
- Be injected into routes

### 3. Runtime Stays Minimal

`stallion-runtime.ts` should only contain:
- VoltAgent initialization
- Service instantiation
- Route mounting
- Core streaming pipeline

## Route Organization

### Route File Structure

Each route file exports a factory function:

```typescript
// routes/agents.ts
import { Hono } from 'hono';
import type { AgentService } from '../services/agent-service.js';

interface AgentRouteDeps {
  agentService: AgentService;
  logger: Logger;
}

export function createAgentRoutes(deps: AgentRouteDeps) {
  const app = new Hono();
  const { agentService, logger } = deps;

  app.get('/', async (c) => {
    try {
      const agents = await agentService.listAgents();
      return c.json(agents);
    } catch (error: any) {
      logger.error('Failed to list agents', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.post('/', async (c) => {
    try {
      const body = await c.req.json();
      const agent = await agentService.createAgent(body);
      return c.json({ success: true, agent });
    } catch (error: any) {
      logger.error('Failed to create agent', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  return app;
}
```

### Route Mounting

Mount routes in `stallion-runtime.ts`:

```typescript
// In setupRoutes() or configureApp()
const agentRoutes = createAgentRoutes({
  agentService: this.agentService,
  logger: this.logger,
});
app.route('/agents', agentRoutes);

const toolRoutes = createToolRoutes({
  configLoader: this.configLoader,
  mcpService: this.mcpService,
  logger: this.logger,
});
app.route('/tools', toolRoutes);
```

### Route Grouping

Group related endpoints in the same file:

```typescript
// routes/workspaces.ts - includes workflow routes
export function createWorkspaceRoutes(deps) { /* workspace CRUD */ }
export function createWorkflowRoutes(deps) { /* workflow operations */ }
```

## Service Layer

### Service Structure

```typescript
// services/agent-service.ts
export class AgentService {
  constructor(
    private configLoader: ConfigLoader,
    private activeAgents: Map<string, Agent>,
    private agentMetadataMap: Map<string, any>,
    private agentSpecs: Map<string, AgentSpec>,
    private logger: Logger
  ) {}

  async listAgents(): Promise<AgentSummary[]> {
    const metadataList = await this.configLoader.listAgents();
    return metadataList.map(m => ({
      slug: m.slug,
      name: m.name,
      description: m.description,
      icon: m.icon,
      isActive: this.activeAgents.has(m.slug),
    }));
  }

  async createAgent(spec: Partial<AgentSpec>): Promise<AgentSpec> {
    // Validation
    if (!spec.name) throw new Error('Agent name is required');
    
    // Business logic
    const slug = this.generateSlug(spec.name);
    const fullSpec = this.buildAgentSpec(spec, slug);
    
    // Persistence
    await this.configLoader.saveAgent(slug, fullSpec);
    
    return fullSpec;
  }

  async deleteAgent(slug: string): Promise<void> {
    // Check dependencies
    const dependentWorkspaces = await this.configLoader.getWorkspacesUsingAgent(slug);
    if (dependentWorkspaces.length > 0) {
      throw new Error(`Cannot delete: used by workspaces: ${dependentWorkspaces.join(', ')}`);
    }
    
    // Cleanup runtime state
    this.activeAgents.delete(slug);
    this.agentMetadataMap.delete(slug);
    this.agentSpecs.delete(slug);
    
    // Persistence
    await this.configLoader.deleteAgent(slug);
  }
}
```

### Service Responsibilities

| Layer | Responsibilities |
|-------|-----------------|
| Routes | HTTP parsing, response formatting, HTTP errors |
| Services | Business logic, validation, coordination, domain errors |
| Adapters | Storage operations, external API calls |
| ConfigLoader | File system operations, config parsing |

## Type Safety

### Core Principle: No Shortcuts

**Do not take shortcuts with TypeScript typing.** When fixing type errors:

1. **Understand the actual type** - Check `node_modules/*/dist/*.d.ts` for the real type definition
2. **Use correct APIs** - Don't use `as any` to silence errors without understanding why they occur
3. **Type assertions are last resort** - Only use when you've verified the runtime behavior is correct and the type system can't express it
4. **Add explicit types to parameters** - Never leave implicit `any` types on function parameters

```typescript
// ❌ Wrong - silencing without understanding
const result = await something() as any;
result.property;  // No idea if this exists

// ✅ Correct - understand the type first
// Check: grep -r "interface Result" node_modules/pkg/dist --include="*.d.ts"
const result: ActualResultType = await something();
result.knownProperty;
```

### VoltAgent Types

VoltAgent types differ from what you might expect. Always check the actual type definitions:

```typescript
// OperationContext uses Map, not object properties
// ❌ Wrong
context.metadata.toolCallCount = 1;

// ✅ Correct
context.context.set('toolCallCount', 1);
const count = context.context.get('toolCallCount') as number;
```

```typescript
// Conversation doesn't have messages - fetch separately
// ❌ Wrong
const messages = conversation.messages;

// ✅ Correct
const conversation = await memory.getConversation(id);
const messages = await memory.getMessages(userId, conversationId);
```

```typescript
// CreateConversationInput requires metadata
// ❌ Wrong - missing required field
await memory.createConversation({
  id, resourceId, userId, title
});

// ✅ Correct
await memory.createConversation({
  id, resourceId, userId, title,
  metadata: {},
});
```

### UsageInfo vs LanguageModelV2Usage

Two different types with different property names:

| Type | Input Tokens | Output Tokens |
|------|--------------|---------------|
| VoltAgent `UsageInfo` | `promptTokens` | `completionTokens` |
| AI SDK `LanguageModelV2Usage` | `inputTokens` | `outputTokens` |

Check which type you're working with before accessing properties.

### Type Narrowing for Union Types

```typescript
// ❌ Wrong - union type not narrowed
const result = schemaJson
  ? await agent.generateObject(prompt, schema, options)
  : await agent.generateText(prompt, options);
const response = result.object || result.text;  // Error!

// ✅ Correct - use type assertion after conditional
const response = schemaJson 
  ? (result as any).object 
  : (result as any).text;
```

### Optional Chaining

Always check for undefined before accessing:

```typescript
// ❌ Wrong - might be undefined
const model = await this.modelCatalog.resolveModelId(id);

// ✅ Correct
if (this.modelCatalog) {
  const model = await this.modelCatalog.resolveModelId(id);
}
```

### Agent Property Access

The `Agent` class doesn't expose all properties you might expect:

```typescript
// ❌ Wrong - Agent doesn't have .tools property
const tools = agent.tools;

// ✅ Correct - use cached tools from runtime
const tools = this.agentTools.get(slug) || [];
```

```typescript
// ❌ Wrong - model might be a DynamicValue
const modelId = agent.model.modelId;

// ✅ Correct - type narrow first
const agentModel = agent.model as { modelId?: string } | undefined;
const modelId = agentModel?.modelId;
```

## Error Handling

### Route Error Pattern

```typescript
app.post('/endpoint', async (c) => {
  try {
    const result = await service.doSomething();
    return c.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Operation failed', { error });
    
    // Check for specific error types
    const isAuthError = error.message?.includes('403') ||
                        error.message?.includes('credential');
    const statusCode = isAuthError ? 401 : 500;
    
    return c.json({ success: false, error: error.message }, statusCode);
  }
});
```

### Service Error Pattern

```typescript
async doSomething(): Promise<Result> {
  // Validation errors - throw with clear message
  if (!input.required) {
    throw new Error('Required field missing');
  }
  
  // Business rule violations
  if (await this.wouldViolateConstraint(input)) {
    throw new Error('Cannot perform: constraint violated');
  }
  
  // Let unexpected errors bubble up
  return await this.adapter.save(input);
}
```

## Streaming

### Stream Handler Pattern

Handlers process chunks in a pipeline:

```typescript
export class MyHandler implements StreamHandler {
  async handle(chunk: StreamChunk): Promise<StreamChunk | null> {
    if (chunk.type === 'my-type') {
      // Process and transform
      return { ...chunk, processed: true };
    }
    return chunk;  // Pass through unchanged
  }
  
  async finalize(): Promise<HandlerResult> {
    return { /* final state */ };
  }
}
```

### Pipeline Usage

```typescript
const pipeline = new StreamPipeline();
pipeline
  .use(new ReasoningHandler({ enableThinking: true }))
  .use(new TextDeltaHandler())
  .use(new ToolCallHandler())
  .use(new CompletionHandler());

for await (const chunk of pipeline.run(stream)) {
  await writer.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

const results = await pipeline.finalize();
```

## Logging

### Use Pino Logger

```typescript
this.logger.info('Operation started', { agentSlug, conversationId });
this.logger.error('Operation failed', { error, context });
this.logger.debug('Debug info', { details });
this.logger.warn('Unexpected state', { state });
```

### Log Levels

| Level | Use For |
|-------|---------|
| `error` | Failures that need attention |
| `warn` | Unexpected but handled situations |
| `info` | Important operations (start/end, key events) |
| `debug` | Detailed debugging info |

### Structured Context

Always include relevant context:

```typescript
this.logger.info('[Chat Endpoint] Processing request', {
  slug,
  conversationId,
  hasInput: !!input,
  modelOverride: !!modelOverride,
});
```

## Migration Checklist

When extracting code from `stallion-runtime.ts`:

1. **Identify the domain** - agents, tools, workspaces, monitoring, etc.
2. **Create route file** - `routes/<domain>.ts`
3. **Create service if needed** - `services/<domain>-service.ts`
4. **Extract route handlers** - Move HTTP handling to route file
5. **Extract business logic** - Move to service
6. **Update runtime** - Import and mount routes
7. **Run type check** - `npx tsc --noEmit --skipLibCheck`
8. **Test endpoints** - Verify functionality unchanged

## Common Pitfalls

1. **Assuming VoltAgent properties exist** - Check type definitions
2. **Wrong usage property names** - `promptTokens` vs `inputTokens`
3. **Missing null checks** - Use optional chaining
4. **HTTP logic in services** - Keep in routes only
5. **Business logic in routes** - Extract to services
6. **Missing metadata in CreateConversationInput** - Required field
7. **Accessing agent.tools directly** - Use cached tools map
8. **Not narrowing union types** - Use type assertions after conditionals

## Telemetry & Metrics

### Architecture

```
App (OTel SDK) → Collector (:4318) → Prometheus (:8889) → Grafana (:3333)
                                   → Jaeger (:4317)
```

The OTel SDK bootstraps in `src-server/telemetry.ts` (must be imported before all other modules). Metric instruments are defined in `src-server/telemetry/metrics.ts`. Both are no-ops when `OTEL_EXPORTER_OTLP_ENDPOINT` is not set.

### Recording Metrics

Import instruments from `telemetry/metrics.js` and call `.add()` or `.record()`:

```typescript
import { chatRequests, tokensInput } from '../telemetry/metrics.js';

chatRequests.add(1, { agent: slug });
tokensInput.add(usage.promptTokens || usage.inputTokens || 0, { agent: slug });
```

### Token Field Fallback Pattern

The AI SDK returns different field names depending on the provider. Bedrock uses `inputTokens`/`outputTokens`, while the AI SDK public API uses `promptTokens`/`completionTokens`. Always use the fallback chain:

```typescript
usage.promptTokens || usage.inputTokens || 0    // input tokens
usage.completionTokens || usage.outputTokens || 0  // output tokens
```

This pattern is used in `stallion-runtime.ts` (OTel recording + monitoring events) and `tool-executor.ts` (conversation stats).

### Where Metrics Are Recorded

| Metric | Location | Trigger |
|--------|----------|---------|
| `chat.requests`, `chat.duration`, `tokens.*` | `stallion-runtime.ts` completion handler | After stream finishes |
| `chat.errors` | `stallion-runtime.ts` catch block | On chat endpoint error |
| `tool.calls` | `MetadataHandler.collectStats()` | On `tool-call` stream chunk |
| `tool.duration` | `MetadataHandler.collectStats()` | Between `tool-call` and `tool-result` chunks |
| `tokens.context`, `cost.estimated` | `tool-executor.ts` stats update | After VoltAgent hook fires |
| `agents.active`, `mcp.connections` | `stallion-runtime.ts` init | Observable gauges, polled by SDK |

### Dashboard

The Grafana dashboard JSON lives at `monitoring/grafana/dashboards/stallion.json` and is bind-mounted into the container. Edits to the file are reflected immediately. The datasource uses a stable UID (`stallion-prometheus`) set in `monitoring/runtime/grafana-provisioning/datasources/prometheus.yml`.
