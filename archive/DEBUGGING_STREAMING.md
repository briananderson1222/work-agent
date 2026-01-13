# Debugging the Streaming Pipeline

## Quick Start

### Test the Endpoint

```bash
# Correct endpoint (note /api prefix)
curl -N -X POST http://localhost:3141/api/agents/test-nova-limited-tools/chat \
  -H "Content-Type: application/json" \
  -d '{
    "input": "What meetings do I have today?",
    "options": {
      "userId": "test",
      "conversationId": "debug-session-1"
    }
  }'
```

**Important:** The endpoint is `/api/agents/:slug/chat` NOT `/agents/:slug/chat`

### Enable Debug Logging

Set the `DEBUG_STREAMING` environment variable:

```bash
DEBUG_STREAMING=true npm run dev:server
```

This enables debug logging in all streaming handlers. Check logs:
```bash
grep "\[PIPELINE\]\|\[ReasoningHandler\]\|\[TextDeltaHandler\]" /tmp/server.log | head -20
```

### Check What Events Are Emitted

```bash
# Capture stream output
curl -N -X POST http://localhost:3141/api/agents/test-nova-limited-tools/chat \
  -H "Content-Type: application/json" \
  -d '{"input": "Hi", "options": {"userId": "test", "conversationId": "test-1"}}' \
  2>/dev/null | grep '"type":' | head -20
```

## Key Files

### Pipeline Architecture
- `src-server/runtime/streaming/StreamPipeline.ts` - Main pipeline orchestrator
- `src-server/runtime/streaming/types.ts` - Type definitions
- `src-server/runtime/streaming/handlers/` - Individual handlers

### Handlers (in order)
1. `ReasoningHandler.ts` - Detects `<thinking>` tags, emits reasoning events
2. `TextDeltaHandler.ts` - Processes text-delta events
3. `ToolCallHandler.ts` - Processes tool-call events
4. `MetadataHandler.ts` - Collects statistics
5. `CompletionHandler.ts` - Writes [DONE] at end

### Integration Point
- `src-server/runtime/voltagent-runtime.ts` around line 1960-2000
- Search for "useNewPipeline" to find where pipeline is initialized

## Common Issues

### 1. Events Not Appearing in Stream

**Check:**
- Is the pipeline being used? Search logs for "StreamPipeline"
- Are chunks being received? Set `DEBUG_STREAMING=true` and check logs
- Are handlers processing chunks? Check handler debug logs

### 2. Wrong Event Format

**Check:**
- What does VoltAgent send? Look at `[PIPELINE] Chunk:` logs
- What are handlers emitting? Check `stream.write()` calls
- Compare to AI SDK spec: See `STREAMING_COMPLIANCE.md`

### 3. Missing Events (start, finish, etc.)

**Cause:** No handler processes these chunk types, so they're silently dropped.

**Fix:** Add PassThroughHandler at end of pipeline to write unhandled chunks.

### 4. Reasoning Events Not Working

**Check:**
- Is `enableThinking` true in agent config?
- Is ReasoningHandler first in the pipeline? (Must be before TextDeltaHandler)
- Are `<thinking>` tags in the model output? Check raw chunks

## Debugging Workflow

### Step 1: Verify Pipeline is Active

```bash
# Start server with debug logging
DEBUG_STREAMING=true npm run dev:server > /tmp/debug.log 2>&1 &

# Make request
curl -X POST http://localhost:3141/api/agents/test-nova-limited-tools/chat \
  -H "Content-Type: application/json" \
  -d '{"input": "Hi", "options": {"userId": "test", "conversationId": "test-1"}}' \
  2>/dev/null > /dev/null

# Check if pipeline was used
grep "StreamPipeline" /tmp/debug.log
```

If no output, check:
- Code is rebuilt: `npm run build:server`
- Using correct endpoint: `/api/agents/:slug/chat`

### Step 2: See What Chunks Are Received

Add debug logging to `StreamPipeline.process()` and check logs:

```bash
grep "\[PIPELINE\]" /tmp/debug.log | head -30
```

Expected chunks from VoltAgent:
- `{type: "start"}`
- `{type: "start-step", request: {}, warnings: []}`
- `{type: "text-start", id: "0"}`
- `{type: "text-delta", id: "0", text: "..."}`
- `{type: "text-end", id: "0"}`
- `{type: "finish-step", finishReason: "stop", usage: {...}}`
- `{type: "finish", finishReason: "stop", totalUsage: {...}}`

### Step 3: See What Events Are Emitted

```bash
curl -N -X POST http://localhost:3141/api/agents/test-nova-limited-tools/chat \
  -H "Content-Type: application/json" \
  -d '{"input": "Hi", "options": {"userId": "test", "conversationId": "test-1"}}' \
  2>/dev/null > /tmp/stream-output.txt

# Check event types
grep '"type":' /tmp/stream-output.txt | head -20
```

Compare received chunks vs emitted events to find what's being dropped.

### Step 4: Add Handler Debug Logging

Add to each handler's `process()` method:

```typescript
async process(context: ProcessContext): Promise<ProcessContext> {
  console.log(`[${this.name}] Processing:`, context.originalChunk.type);
  
  // ... handler logic
  
  if (context.eventType) {
    console.log(`[${this.name}] Emitted:`, context.eventType);
  }
  
  return context;
}
```

This shows which handler processes which chunk and what it emits.

## Testing Different Scenarios

### Test 1: Simple Text (No Tools)
```bash
curl -N -X POST http://localhost:3141/api/agents/test-nova-limited-tools/chat \
  -H "Content-Type: application/json" \
  -d '{"input": "Say hello in one sentence", "options": {"userId": "test", "conversationId": "test-simple"}}' \
  2>/dev/null | head -30
```

Expected: `start`, `start-step`, `text-start`, `text-delta`s, `text-end`, `finish-step`, `finish`, `[DONE]`

### Test 2: With Thinking Blocks
```bash
curl -N -X POST http://localhost:3141/api/agents/test-nova-limited-tools/chat \
  -H "Content-Type: application/json" \
  -d '{"input": "What meetings do I have?", "options": {"userId": "test", "conversationId": "test-thinking"}}' \
  2>/dev/null | grep -E "reasoning|thinking" | head -10
```

Expected: `reasoning-start`, `reasoning-delta`s, `reasoning-end`

### Test 3: With Tool Calls
```bash
curl -N -X POST http://localhost:3141/api/agents/test-nova-limited-tools/chat \
  -H "Content-Type: application/json" \
  -d '{"input": "Check my calendar", "options": {"userId": "test", "conversationId": "test-tools"}}' \
  2>/dev/null | grep "tool" | head -10
```

Expected: `tool-approval-request` (custom), eventually `tool-call`, `tool-result`

## AI SDK Compliance

See `STREAMING_COMPLIANCE.md` for:
- Full list of AI SDK event types
- Current implementation status
- Known issues and fixes
- Field name requirements (`text` not `content`, `id` required, etc.)

## Quick Reference

### Debug Logging
```bash
DEBUG_STREAMING=true npm run dev:server
```

### Pipeline Handler Order
1. ReasoningHandler (must be first to catch `<thinking>` before TextDeltaHandler)
2. TextDeltaHandler
3. ToolCallHandler
4. MetadataHandler
5. CompletionHandler

### Add New Handler
```typescript
// In voltagent-runtime.ts around line 2010
const debugStreaming = process.env.DEBUG_STREAMING === 'true';

pipeline
  .use(new ReasoningHandler({ enableThinking: true, debug: debugStreaming }))
  .use(new YourNewHandler({ debug: debugStreaming }))
  .use(new TextDeltaHandler({ debug: debugStreaming }))
  // ... rest
```

### Handler Template
```typescript
export class YourHandler implements StreamHandler {
  name = 'your-handler';
  
  constructor(
    private stream: HandlerConfig['stream'],
    private config: Pick<HandlerConfig, 'debug'> = {}
  ) {}
  
  async process(context: ProcessContext): Promise<ProcessContext> {
    const chunk = context.originalChunk;
    
    // Only process specific chunk types
    if (chunk.type !== 'your-type') {
      return context;
    }
    
    // Transform and emit
    await this.stream.write(
      `data: ${JSON.stringify({ 
        type: 'your-event',
        // ... your data
      })}\n\n`
    );
    
    // Mark as handled
    context.eventType = 'your-event';
    
    return context;
  }
}
```

## Troubleshooting Checklist

- [ ] Server rebuilt after code changes: `npm run build:server`
- [ ] Using correct endpoint: `/api/agents/:slug/chat` (note `/api` prefix)
- [ ] Agent exists and is loaded (check server startup logs)
- [ ] Debug logging enabled: `DEBUG_STREAMING=true`
- [ ] Comparing received chunks vs emitted events
- [ ] Handler order is correct (ReasoningHandler first)
- [ ] Field names match AI SDK spec (`text` not `content`, `id` present)
