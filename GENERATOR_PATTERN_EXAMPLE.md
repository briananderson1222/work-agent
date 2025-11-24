# Generator Pattern for Streaming Pipeline

## Core Concept

Each handler is an async generator that:
- Takes a stream of chunks as input
- Yields 0 or more chunks as output
- Maintains internal state
- Chains with other handlers

## Type Definitions

```typescript
import type { TextStreamPart } from 'ai';

export type StreamChunk = TextStreamPart<any>;

export interface StreamHandler {
  name: string;
  
  /**
   * Process a stream of chunks
   * Yields 0+ output chunks per input chunk
   */
  process(input: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk>;
}
```

## Pipeline Implementation

```typescript
export class StreamPipeline {
  private handlers: StreamHandler[] = [];

  use(handler: StreamHandler): this {
    this.handlers.push(handler);
    return this;
  }

  /**
   * Run the pipeline
   * Each handler processes the output of the previous handler
   */
  async *run(input: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    let stream = input;
    
    // Chain handlers: each processes output of previous
    for (const handler of this.handlers) {
      stream = handler.process(stream);
    }
    
    // Yield final output
    for await (const chunk of stream) {
      yield chunk;
    }
  }
}
```

## Handler Examples

### 1. PassThroughHandler (Identity)

```typescript
export class PassThroughHandler implements StreamHandler {
  name = 'pass-through';
  
  async *process(input: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    // Just pass everything through unchanged
    for await (const chunk of input) {
      yield chunk;
    }
  }
}
```

### 2. FilterHandler (Suppression)

```typescript
export class FilterHandler implements StreamHandler {
  name = 'filter';
  
  async *process(input: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    for await (const chunk of input) {
      // Suppress certain chunk types
      if (chunk.type === 'raw') {
        continue; // Don't yield = suppress
      }
      yield chunk;
    }
  }
}
```

### 3. TransformHandler (One-to-One)

```typescript
export class TransformHandler implements StreamHandler {
  name = 'transform';
  
  async *process(input: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    for await (const chunk of input) {
      if (chunk.type === 'text-delta') {
        // Transform the chunk
        yield {
          ...chunk,
          text: chunk.text.toUpperCase()
        };
      } else {
        yield chunk;
      }
    }
  }
}
```

### 4. ReasoningHandler (Many-to-Many with State)

```typescript
export class ReasoningHandler implements StreamHandler {
  name = 'reasoning';
  
  // State maintained across chunks
  private inThinking = false;
  private buffer = '';
  private partialTag = '';
  private thinkingContent = '';
  
  async *process(input: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    for await (const chunk of input) {
      // Only process text-delta
      if (chunk.type !== 'text-delta') {
        yield chunk;
        continue;
      }
      
      const text = chunk.text || '';
      const id = chunk.id || '0';
      
      // Process character by character
      for (const char of text) {
        this.partialTag += char;
        
        // Detected <thinking> tag
        if (this.partialTag.includes('<thinking>')) {
          // Emit any text before the tag
          const beforeTag = this.partialTag.substring(0, this.partialTag.indexOf('<thinking>'));
          if (beforeTag) {
            yield {type: 'text-delta', id, text: beforeTag};
          }
          
          // Start reasoning block
          yield {type: 'reasoning-start', id, text: ''};
          this.inThinking = true;
          this.thinkingContent = '';
          this.partialTag = '';
          continue;
        }
        
        // Detected </thinking> tag
        if (this.partialTag.includes('</thinking>')) {
          // End reasoning block
          yield {type: 'reasoning-end', id, text: this.thinkingContent};
          this.inThinking = false;
          this.thinkingContent = '';
          this.partialTag = '';
          continue;
        }
        
        // Building a potential tag - keep buffering
        if (this.isPotentialTag(this.partialTag)) {
          continue; // Don't yield yet
        }
        
        // Not a tag - emit the buffered content
        if (this.inThinking) {
          this.thinkingContent += this.partialTag;
          yield {type: 'reasoning-delta', id, text: this.partialTag};
        } else {
          yield {type: 'text-delta', id, text: this.partialTag};
        }
        
        this.partialTag = '';
      }
    }
  }
  
  private isPotentialTag(str: string): boolean {
    return '<thinking>'.startsWith(str) || '</thinking>'.startsWith(str);
  }
}
```

### 5. ToolCallHandler (Pass Through Specific Types)

```typescript
export class ToolCallHandler implements StreamHandler {
  name = 'tool-call';
  
  async *process(input: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    for await (const chunk of input) {
      // Just pass through - no transformation needed
      yield chunk;
      
      // Could add logging/metrics here
      if (chunk.type === 'tool-call') {
        console.log('[tool-call]', chunk);
      }
    }
  }
}
```

### 6. MetadataHandler (Side Effects, No Transformation)

```typescript
export class MetadataHandler implements StreamHandler {
  name = 'metadata';
  
  private stats = {
    textChunks: 0,
    toolCalls: 0,
    reasoningBlocks: 0
  };
  
  async *process(input: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    for await (const chunk of input) {
      // Collect stats (side effect)
      if (chunk.type === 'text-delta') this.stats.textChunks++;
      if (chunk.type === 'tool-call') this.stats.toolCalls++;
      if (chunk.type === 'reasoning-start') this.stats.reasoningBlocks++;
      
      // Pass through unchanged
      yield chunk;
    }
  }
  
  getStats() {
    return this.stats;
  }
}
```

## Usage Example

```typescript
const pipeline = new StreamPipeline()
  .use(new ReasoningHandler())      // Transform text-delta → reasoning events
  .use(new ToolCallHandler())       // Pass through, log tool calls
  .use(new MetadataHandler());      // Collect stats

// Process VoltAgent's fullStream
for await (const chunk of pipeline.run(result.fullStream)) {
  // Write to SSE stream
  await streamWriter.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

// Write [DONE]
await streamWriter.write('data: [DONE]\n\n');
```

## Key Benefits

### 1. Natural Composition
Handlers chain naturally - output of one becomes input of next:
```
VoltAgent → ReasoningHandler → ToolCallHandler → MetadataHandler → SSE Stream
```

### 2. Implicit Suppression
Don't yield = suppress:
```typescript
if (shouldSuppress) {
  continue; // Don't yield
}
yield chunk;
```

### 3. Many-to-Many
Yield multiple chunks per input:
```typescript
yield {type: 'reasoning-start', ...};
yield {type: 'reasoning-delta', ...};
yield {type: 'reasoning-end', ...};
```

### 4. Stateful Processing
Handlers maintain state across chunks:
```typescript
private buffer = '';
private inThinking = false;
```

### 5. No Wrapper Types
No ProcessContext, no eventType flags - just chunks in, chunks out.

## Comparison to Current Design

### Current (ProcessContext)
```typescript
// Handler
async process(context: ProcessContext): Promise<ProcessContext> {
  if (context.eventType) return context; // Already handled
  
  const chunk = context.originalChunk;
  if (chunk.type === 'text-delta') {
    await this.stream.write(...);
    context.eventType = 'text-delta';
  }
  return context;
}

// Pipeline
for (const handler of this.handlers) {
  context = await handler.process(context);
}
```

### Generator
```typescript
// Handler
async *process(input: AsyncIterable<StreamChunk>) {
  for await (const chunk of input) {
    if (chunk.type === 'text-delta') {
      yield {type: 'text-delta', ...};
    } else {
      yield chunk;
    }
  }
}

// Pipeline
let stream = input;
for (const handler of this.handlers) {
  stream = handler.process(stream);
}
for await (const chunk of stream) {
  await this.stream.write(...);
}
```

## Trade-offs

### Pros
- ✅ More functional/composable
- ✅ No wrapper types (ProcessContext)
- ✅ No PassThroughHandler needed
- ✅ Natural for many-to-many transformations
- ✅ Implicit suppression (don't yield)
- ✅ Clear data flow

### Cons
- ❌ Generators less familiar to some developers
- ❌ Slightly more complex to debug (async generators)
- ❌ Can't easily share metadata between handlers (would need separate channel)
- ❌ Handler order matters more (can't skip ahead)

## When to Use

**Use generators if:**
- Handlers need many-to-many transformations
- Suppression is common
- Handlers are mostly independent
- You want functional composition

**Use ProcessContext if:**
- Handlers need to share metadata
- You want explicit "handled" flags
- You need to skip handlers conditionally
- Team is less familiar with generators
