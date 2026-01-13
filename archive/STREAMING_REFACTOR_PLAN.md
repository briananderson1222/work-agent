# Streaming Refactor Implementation Plan

## Overview
Refactor monolithic streaming logic into a pipeline-based architecture where handlers process chunks in sequence. Each handler decides if a chunk is relevant, processes it, and passes context to the next handler.

---

## Architecture

### Pipeline Pattern
```
Bedrock Chunk → ReasoningHandler → TextDeltaHandler → ToolCallHandler → MetadataHandler → Done
```

Every handler always runs. They either:
1. **Transform**: Process the chunk and update context
2. **Pass through**: Return context unchanged

---

## Core Interfaces

### ProcessContext
```typescript
interface ProcessContext {
  originalChunk: BedrockChunk;  // Raw chunk from Bedrock
  eventType?: string;            // Transformed event type (reasoning-start, text-delta, tool-call, etc.)
  content?: string;              // Transformed content
  metadata: Map<string, any>;    // Shared state across handlers
}
```

### StreamHandler
```typescript
interface StreamHandler {
  name: string;
  process(context: ProcessContext): Promise<ProcessContext>;
}
```

### BedrockChunk
```typescript
interface BedrockChunk {
  type: 'text-delta' | 'tool-call' | 'metadata' | 'start' | 'finish';
  text?: string;
  toolData?: {
    name: string;
    input: any;
    id: string;
  };
  tokens?: number;
}
```

### HandlerConfig
```typescript
interface HandlerConfig {
  stream: WritableStream;
  debug?: boolean;
  enableThinking?: boolean;  // For ReasoningHandler
}
```

---

## Implementation Details

### 1. StreamPipeline (src-server/runtime/streaming/StreamPipeline.ts)

```typescript
class StreamPipeline {
  private handlers: StreamHandler[] = [];
  
  use(handler: StreamHandler): this {
    this.handlers.push(handler);
    return this;
  }
  
  async process(chunk: BedrockChunk): Promise<void> {
    let context: ProcessContext = {
      originalChunk: chunk,
      metadata: new Map()
    };
    
    // Every handler always runs
    for (const handler of this.handlers) {
      context = await handler.process(context);
    }
  }
  
  async finalize(): Promise<void> {
    // Send final metadata, close stream
  }
}
```

**Usage:**
```typescript
const pipeline = new StreamPipeline()
  .use(new ReasoningHandler(stream, { enableThinking: true, debug: true }))
  .use(new TextDeltaHandler(stream, { debug: true }))
  .use(new ToolCallHandler(stream, { debug: true }))
  .use(new MetadataHandler());

for await (const chunk of bedrockStream) {
  await pipeline.process(chunk);
}

await pipeline.finalize();
```

---

### 2. ReasoningHandler (src-server/runtime/streaming/handlers/ReasoningHandler.ts)

**Responsibilities:**
- Buffer text chunks looking for `<thinking>` and `</thinking>` tags
- Emit `reasoning-start` when thinking block opens
- Emit `reasoning-delta` for content inside thinking block
- Emit `reasoning-end` when thinking block closes
- Pass through non-thinking text as `text-delta` events

**Key Logic:**
```typescript
class ReasoningHandler implements StreamHandler {
  name = 'reasoning';
  private inThinking = false;
  private buffer = '';
  private partialTag = '';  // For handling tags split across chunks
  
  async process(context: ProcessContext): Promise<ProcessContext> {
    // If already transformed by previous handler, pass through
    if (context.eventType) return context;
    
    // Only process text-delta chunks
    if (context.originalChunk.type !== 'text-delta') return context;
    
    const text = context.originalChunk.text;
    
    // Process character by character to detect tags
    for (const char of text) {
      this.partialTag += char;
      
      // Check for thinking start
      if (this.partialTag.includes('<thinking>')) {
        this.inThinking = true;
        await this.writeEvent('reasoning-start', '');
        context.eventType = 'reasoning-start';
        this.partialTag = '';
        continue;
      }
      
      // Check for thinking end
      if (this.partialTag.includes('</thinking>')) {
        await this.writeEvent('reasoning-end', this.buffer);
        context.eventType = 'reasoning-end';
        context.content = this.buffer;
        this.buffer = '';
        this.inThinking = false;
        this.partialTag = '';
        continue;
      }
      
      // If we're building a potential tag, keep buffering
      if (this.isPotentialTag(this.partialTag)) {
        continue;
      }
      
      // Not a tag, process the buffered content
      if (this.inThinking) {
        this.buffer += this.partialTag;
        await this.writeEvent('reasoning-delta', this.partialTag);
        context.eventType = 'reasoning-delta';
        context.content = this.partialTag;
      } else {
        // Outside thinking block - pass to text handler
        context.eventType = 'text-delta';
        context.content = this.partialTag;
      }
      
      this.partialTag = '';
    }
    
    return context;
  }
  
  private isPotentialTag(str: string): boolean {
    return '<thinking>'.startsWith(str) || '</thinking>'.startsWith(str);
  }
  
  private async writeEvent(type: string, content: string): Promise<void> {
    if (!this.config.enableThinking && type.startsWith('reasoning')) {
      return; // Don't emit thinking events if disabled
    }
    
    await this.stream.write(
      `data: ${JSON.stringify({ type, content })}\n\n`
    );
    
    if (this.config.debug) {
      console.log(`[${type}]`, content.substring(0, 50));
    }
  }
}
```

**Edge Cases to Handle:**
1. Tag split across chunks: `"<thin"` then `"king>"`
2. Multiple thinking blocks: `"<thinking>A</thinking> text <thinking>B</thinking>"`
3. Unclosed thinking block at stream end
4. Nested tags (treat as single block)

---

### 3. TextDeltaHandler (src-server/runtime/streaming/handlers/TextDeltaHandler.ts)

**Responsibilities:**
- Process `text-delta` events (from ReasoningHandler or original chunks)
- Write to SSE stream
- Track text statistics

```typescript
class TextDeltaHandler implements StreamHandler {
  name = 'text-delta';
  
  constructor(
    private stream: WritableStream,
    private config: HandlerConfig
  ) {}
  
  async process(context: ProcessContext): Promise<ProcessContext> {
    // Only process text-delta events
    if (context.eventType !== 'text-delta') {
      return context; // Pass through
    }
    
    if (!context.content || context.content.length === 0) {
      return context;
    }
    
    await this.stream.write(
      `data: ${JSON.stringify({ 
        type: 'text-delta', 
        content: context.content 
      })}\n\n`
    );
    
    if (this.config.debug) {
      console.log('[text-delta]', context.content);
    }
    
    // Update metadata
    context.metadata.set('textChunks', 
      (context.metadata.get('textChunks') || 0) + 1
    );
    context.metadata.set('textLength',
      (context.metadata.get('textLength') || 0) + context.content.length
    );
    
    return context;
  }
}
```

---

### 4. ToolCallHandler (src-server/runtime/streaming/handlers/ToolCallHandler.ts)

**Responsibilities:**
- Process tool-call chunks from Bedrock
- Write to SSE stream
- Track tool call statistics

```typescript
class ToolCallHandler implements StreamHandler {
  name = 'tool-call';
  
  constructor(
    private stream: WritableStream,
    private config: HandlerConfig
  ) {}
  
  async process(context: ProcessContext): Promise<ProcessContext> {
    // Only process tool-call chunks
    if (context.originalChunk.type !== 'tool-call') {
      return context; // Pass through
    }
    
    const toolData = context.originalChunk.toolData;
    
    await this.stream.write(
      `data: ${JSON.stringify({ 
        type: 'tool-call',
        name: toolData.name,
        input: toolData.input,
        id: toolData.id
      })}\n\n`
    );
    
    if (this.config.debug) {
      console.log('[tool-call]', toolData.name);
    }
    
    context.eventType = 'tool-call';
    context.metadata.set('toolCalls', 
      (context.metadata.get('toolCalls') || 0) + 1
    );
    
    return context;
  }
}
```

---

### 5. MetadataHandler (src-server/runtime/streaming/handlers/MetadataHandler.ts)

**Responsibilities:**
- Collect statistics from all events
- Augment context with computed metadata
- Provide final summary

```typescript
class MetadataHandler implements StreamHandler {
  name = 'metadata';
  
  private stats = {
    textChunks: 0,
    textLength: 0,
    reasoningBlocks: 0,
    reasoningChunks: 0,
    toolCalls: 0,
    totalChunks: 0
  };
  
  async process(context: ProcessContext): Promise<ProcessContext> {
    this.stats.totalChunks++;
    
    // Collect stats based on event type
    switch (context.eventType) {
      case 'reasoning-start':
        this.stats.reasoningBlocks++;
        break;
      case 'reasoning-delta':
        this.stats.reasoningChunks++;
        break;
      case 'text-delta':
        this.stats.textChunks++;
        this.stats.textLength += context.content?.length || 0;
        break;
      case 'tool-call':
        this.stats.toolCalls++;
        break;
    }
    
    // Augment context with current stats
    context.metadata.set('stats', { ...this.stats });
    
    return context;
  }
  
  getStats() {
    return { ...this.stats };
  }
  
  async writeFinalStats(stream: WritableStream): Promise<void> {
    await stream.write(
      `data: ${JSON.stringify({ 
        type: 'metadata',
        stats: this.stats
      })}\n\n`
    );
  }
}
```

---

## File Structure

```
src-server/runtime/streaming/
├── StreamPipeline.ts              # Pipeline executor
├── types.ts                       # Shared interfaces
├── handlers/
│   ├── ReasoningHandler.ts       # Thinking block buffering
│   ├── TextDeltaHandler.ts       # Text output
│   ├── ToolCallHandler.ts        # Tool calls
│   └── MetadataHandler.ts        # Stats collection
└── __tests__/
    ├── ReasoningHandler.test.ts
    ├── TextDeltaHandler.test.ts
    ├── ToolCallHandler.test.ts
    ├── MetadataHandler.test.ts
    └── pipeline.integration.test.ts
```

---

## Testing Strategy

### Unit Tests

**ReasoningHandler.test.ts:**
```typescript
describe('ReasoningHandler', () => {
  test('detects thinking block start')
  test('buffers content inside thinking block')
  test('detects thinking block end')
  test('handles tag split across chunks: "<thin" + "king>"')
  test('handles multiple thinking blocks in sequence')
  test('passes through non-thinking text as text-delta')
  test('handles unclosed thinking block at stream end')
  test('respects enableThinking config')
})
```

**TextDeltaHandler.test.ts:**
```typescript
describe('TextDeltaHandler', () => {
  test('writes text-delta events to stream')
  test('passes through non-text-delta events')
  test('tracks text statistics')
  test('handles empty content')
})
```

**ToolCallHandler.test.ts:**
```typescript
describe('ToolCallHandler', () => {
  test('writes tool-call events to stream')
  test('passes through non-tool-call events')
  test('tracks tool call statistics')
})
```

**MetadataHandler.test.ts:**
```typescript
describe('MetadataHandler', () => {
  test('collects statistics from all event types')
  test('augments context with stats')
  test('provides final summary')
})
```

### Integration Tests

**pipeline.integration.test.ts:**
```typescript
describe('StreamPipeline Integration', () => {
  test('processes simple text response')
  test('processes response with thinking blocks')
  test('processes response with tool calls')
  test('processes mixed content: text + thinking + tool calls')
  test('handles edge case: tag split across chunks')
  test('handles edge case: multiple thinking blocks')
})
```

---

## Migration Strategy

### Phase 1: Parallel Implementation
1. Create new streaming directory and classes
2. Keep existing streaming code untouched
3. Add feature flag: `USE_NEW_STREAMING` in agent config

### Phase 2: Gradual Migration
1. Wire up new pipeline in one test agent
2. Test thoroughly with various scenarios
3. Compare outputs between old and new implementations
4. Fix any discrepancies
5. Migrate one agent at a time

### Phase 3: Cleanup
1. Remove old streaming code
2. Remove feature flag
3. Update documentation
4. Optimize performance if needed

---

## Configuration

Add to agent config:
```typescript
interface AgentStreamingConfig {
  useNewStreaming?: boolean;      // Feature flag
  enableThinking?: boolean;        // Send thinking blocks to client
  debugStreaming?: boolean;        // Enable debug logging
}
```

---

## Current Code Location

**Find existing streaming logic:**
1. Search for: `text-delta`, `streamWriter`, `SSE`, `Server-Sent Events`
2. Likely locations:
   - `src-server/runtime/` (agent runtime)
   - `src-server/routes/` (chat endpoint)
   - Look for Bedrock stream processing

**Key patterns to find:**
- `for await (const chunk of bedrockStream)`
- `streamWriter.write()`
- `data: ${JSON.stringify(...)}\n\n`

---

## Implementation Checklist

### Setup
- [ ] Create `src-server/runtime/streaming/` directory
- [ ] Create `src-server/runtime/streaming/handlers/` directory
- [ ] Create `types.ts` with all interfaces

### Core Implementation
- [ ] Implement `StreamPipeline.ts`
- [ ] Implement `ReasoningHandler.ts`
- [ ] Implement `TextDeltaHandler.ts`
- [ ] Implement `ToolCallHandler.ts`
- [ ] Implement `MetadataHandler.ts`

### Testing
- [ ] Write unit tests for ReasoningHandler
- [ ] Write unit tests for TextDeltaHandler
- [ ] Write unit tests for ToolCallHandler
- [ ] Write unit tests for MetadataHandler
- [ ] Write integration test for full pipeline

### Migration
- [ ] Locate current streaming implementation
- [ ] Add feature flag to agent config
- [ ] Wire up new pipeline in test agent
- [ ] Test with various scenarios
- [ ] Compare old vs new outputs
- [ ] Migrate remaining agents
- [ ] Remove old code and feature flag

### Documentation
- [ ] Add JSDoc comments to all classes
- [ ] Update README with new architecture
- [ ] Document handler extension pattern
- [ ] Add usage examples

---

## Key Benefits

1. **Debuggability**: Each handler logs independently
2. **Testability**: Unit test each handler in isolation
3. **Maintainability**: Clear responsibilities per handler
4. **Extensibility**: Add new handlers without modifying existing ones
5. **Simplicity**: Pure transform stream pattern

---

## Notes

- Every handler always runs (no "continue" flag needed)
- Handlers decide internally if chunk is relevant
- Pass through is the default behavior
- Metadata handler sees everything (runs last)
- ReasoningHandler must run first (transforms raw text)
- Order matters: Reasoning → Text → ToolCall → Metadata
