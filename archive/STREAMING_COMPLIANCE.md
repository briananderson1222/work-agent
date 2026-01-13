# Streaming Pipeline AI SDK Compliance - ACTUAL FINDINGS

## Summary

**VoltAgent IS sending AI SDK-compliant events!** The problem is our pipeline handlers and type definitions don't match what VoltAgent actually sends.

## What VoltAgent Actually Sends

From debug logs, VoltAgent's `fullStream` emits these AI SDK-compliant chunks:

```
{type: "start"}
{type: "start-step", request: {}, warnings: []}
{type: "text-start", id: "0"}
{type: "text-delta", id: "0", text: "Hello"}
{type: "text-delta", id: "0", text: "!"}
...
{type: "text-end", id: "0"}
{type: "finish-step", finishReason: "stop", usage: {...}, response: {...}}
{type: "finish", finishReason: "stop", totalUsage: {...}}
```

## The Problem

### 1. Wrong Type Definition

Our `BedrockChunk` type in `types.ts` is completely wrong:

```typescript
// WRONG - What we defined
export interface BedrockChunk {
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

**Should be:**
```typescript
// CORRECT - What VoltAgent actually sends (AI SDK TextStreamPart)
type BedrockChunk = TextStreamPart<any>;
```

### 2. Handlers Don't Process AI SDK Events

- **TextDeltaHandler**: Only processes `context.eventType === 'text-delta'` but chunks have `type` not `eventType`
- **ToolCallHandler**: Only processes `chunk.type === 'tool-call'` ✓ (correct pattern)
- **ReasoningHandler**: Processes `chunk.type === 'text-delta'` and looks for `<thinking>` tags

### 3. Unhandled Chunks Are Silently Dropped

Chunks like `start`, `start-step`, `text-start`, `text-end`, `finish-step`, `finish` are received but no handler processes them, so they're never written to the stream.

## What's Actually Happening

1. VoltAgent sends: `{type: "start"}`
2. Pipeline receives it
3. ReasoningHandler: checks `chunk.type === 'text-delta'` → NO → returns context unchanged
4. TextDeltaHandler: checks `context.eventType === 'text-delta'` → NO → returns context unchanged  
5. ToolCallHandler: checks `chunk.type === 'tool-call'` → NO → returns context unchanged
6. MetadataHandler: doesn't write anything
7. CompletionHandler: doesn't write anything
8. **Event is lost - never written to stream!**

## The Fix

### Priority 1: Fix Type Definition
```typescript
// src-server/runtime/streaming/types.ts
import type { TextStreamPart } from 'ai';

export type BedrockChunk = TextStreamPart<any>;
```

### Priority 2: Add PassThroughHandler
Write unhandled chunks directly to stream:

```typescript
export class PassThroughHandler implements StreamHandler {
  name = 'pass-through';
  
  async process(context: ProcessContext): Promise<ProcessContext> {
    // If no handler transformed this chunk, write it as-is
    if (!context.eventType) {
      const chunk = context.originalChunk;
      await this.stream.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    return context;
  }
}
```

Add it LAST in the pipeline (after all other handlers).

### Priority 3: Fix TextDeltaHandler
```typescript
async process(context: ProcessContext): Promise<ProcessContext> {
  const chunk = context.originalChunk;
  
  // Process text-delta from ReasoningHandler OR original chunk
  if (context.eventType === 'text-delta' || chunk.type === 'text-delta') {
    const text = context.content || chunk.text;
    if (!text) return context;
    
    await this.stream.write(
      `data: ${JSON.stringify({ 
        type: 'text-delta',
        id: chunk.id,
        text: text
      })}\n\n`
    );
    
    context.eventType = 'text-delta';
  }
  
  return context;
}
```

### Priority 4: Fix ReasoningHandler Field Names
Change `content` to `text` to match AI SDK:

```typescript
await this.writeEvent('reasoning-delta', text); // not content
```

## Expected Result After Fixes

Stream output should include ALL AI SDK events:
```
data: {"type":"start"}
data: {"type":"start-step","request":{},"warnings":[]}
data: {"type":"text-start","id":"0"}
data: {"type":"reasoning-start","id":"0"}
data: {"type":"reasoning-delta","id":"0","text":"To find..."}
data: {"type":"reasoning-end","id":"0"}
data: {"type":"text-delta","id":"0","text":"Hello"}
data: {"type":"text-end","id":"0"}
data: {"type":"finish-step","finishReason":"stop","usage":{...}}
data: {"type":"finish","finishReason":"stop","totalUsage":{...}}
data: [DONE]
```

This will be fully AI SDK compliant!
