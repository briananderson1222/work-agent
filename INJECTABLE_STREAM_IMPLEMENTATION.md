# Injectable Stream Pattern for Tool Approval Ordering

## Problem Statement

VoltAgent's elicitation callback is called BEFORE tool execution, but we need the `tool-approval-request` event to appear in the stream AFTER `reasoning-end` completes. Currently there's a race condition where the approval request can appear in the middle of reasoning deltas.

## Current Flow (Race Condition)

```
Pipeline Thread:
  reasoning-delta: "I"
  reasoning-delta: " "
  reasoning-delta: "need"
  reasoning-delta: " "
  reasoning-delta: "to"
  ...buffering...

Elicitation Callback (separate):
  VoltAgent calls elicitation()
  → Writes tool-approval-request DIRECTLY to stream ← RACE!
  
Pipeline Thread (continues):
  ...finishes buffering...
  reasoning-end: "I need to use the tool"
```

**Result:** `tool-approval-request` appears BEFORE `reasoning-end`

## Proposed Solution: Injectable Stream

Create a stream wrapper that allows the elicitation callback to **inject events** that will be emitted at the next safe boundary (after current chunk processing completes).

### Key Insight

The elicitation callback is called DURING VoltAgent's internal processing, BEFORE it emits `tool-input-start` to the stream. We can inject the approval request event, and it will naturally appear in the stream at the right time (after reasoning-end, before tool-input-start).

## Implementation

### 1. Create InjectableStream Class

```typescript
// src-server/runtime/streaming/InjectableStream.ts

import type { StreamChunk } from './types.js';

/**
 * Stream wrapper that allows injecting events at chunk boundaries
 * 
 * Events are injected by external code (e.g., elicitation callback)
 * and emitted at the next chunk boundary, ensuring proper ordering.
 */
export class InjectableStream {
  private buffer: StreamChunk[] = [];
  
  /**
   * Wrap a source stream and inject buffered events at chunk boundaries
   */
  async *wrap(source: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    for await (const chunk of source) {
      // Before yielding this chunk, yield any injected events
      while (this.buffer.length > 0) {
        yield this.buffer.shift()!;
      }
      
      yield chunk;
    }
    
    // After source completes, yield any remaining buffered events
    while (this.buffer.length > 0) {
      yield this.buffer.shift()!;
    }
  }
  
  /**
   * Inject an event to be emitted at the next chunk boundary
   */
  inject(event: StreamChunk) {
    this.buffer.push(event);
  }
}
```

### 2. Update Runtime to Use Injectable Stream

In `voltagent-runtime.ts` around line 1970:

```typescript
// Create injectable stream for elicitation
const injectableStream = new InjectableStream();

// Get auto-approve list
const autoApprove = agentSpec?.tools?.autoApprove || [];

// Elicitation callback that injects events instead of writing directly
const elicitation = async (request: any) => {
  if (request.type === 'tool-approval') {
    const toolName = request.toolName;
    
    // Check if auto-approved
    if (isAutoApproved(toolName, autoApprove)) {
      this.logger.debug('[Elicitation] Auto-approved', { toolName });
      return true; // Approve immediately, no event needed
    }
    
    // Not auto-approved - inject approval request into stream
    const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.info('[Elicitation] Injecting approval request', {
      approvalId,
      toolName,
    });
    
    // Inject event (will appear at next chunk boundary)
    injectableStream.inject({
      type: 'tool-approval-request',
      approvalId,
      toolName,
      toolDescription: request.toolDescription,
      toolArgs: request.toolArgs,
    } as any);
    
    // Wait for user approval
    return new Promise<boolean>((resolve, reject) => {
      this.pendingApprovals.set(approvalId, { resolve, reject });
      
      const timeout = setTimeout(() => {
        if (this.pendingApprovals.has(approvalId)) {
          this.pendingApprovals.delete(approvalId);
          this.logger.warn('[Elicitation] Approval timeout', { approvalId });
          resolve(false); // Deny on timeout
        }
      }, 60000);
      
      const originalResolve = resolve;
      const wrappedResolve = (value: boolean) => {
        clearTimeout(timeout);
        originalResolve(value);
      };
      this.pendingApprovals.set(approvalId, { resolve: wrappedResolve, reject });
    });
  }
  return false;
};

// Add elicitation to operationContext
operationContext = {
  ...restOptions,
  elicitation,
};

// ... later when running pipeline ...

// Wrap fullStream with injectable stream
const wrappedStream = injectableStream.wrap(result.fullStream);

// Run pipeline on wrapped stream
for await (const chunk of pipeline.run(wrappedStream)) {
  await streamWriter.write(`data: ${JSON.stringify(chunk)}\n\n`);
}
```

### 3. Add isAutoApproved Helper

```typescript
/**
 * Check if tool name matches any auto-approve pattern
 * Supports wildcards: "tool_*" matches "tool_read", "tool_write", etc.
 */
function isAutoApproved(toolName: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    if (pattern === '*') return true;
    
    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
      .replace(/\*/g, '.*'); // Convert * to .*
    
    return new RegExp(`^${regexPattern}$`).test(toolName);
  });
}
```

### 4. Remove ElicitationHandler from Pipeline

Since elicitation is handled via the callback + injectable stream, remove ElicitationHandler:

```typescript
pipeline
  .use(new ReasoningHandler({ enableThinking, debug: debugStreaming }))
  .use(new TextDeltaHandler({ debug: debugStreaming }))
  .use(new ToolCallHandler({ debug: debugStreaming }))
  .use(metadataHandler)
  .use(completionHandler);
```

## How It Works

### Scenario 1: Auto-Approved Tool
```
1. VoltAgent detects tool use
2. Calls elicitation() → checks auto-approve → returns true immediately
3. VoltAgent emits: tool-input-start, tool-input-delta, tool-input-end
4. VoltAgent executes tool
5. VoltAgent emits: tool-result
6. Pipeline processes all events in order
```

**No approval request emitted** ✓

### Scenario 2: Non-Auto-Approved Tool
```
1. VoltAgent detects tool use
2. Calls elicitation() → not auto-approved
3. Elicitation injects tool-approval-request into buffer
4. Elicitation waits for user response (blocks VoltAgent)
5. Pipeline continues processing reasoning-delta chunks
6. Pipeline finishes reasoning-end
7. Pipeline reaches next chunk boundary
8. InjectableStream yields buffered tool-approval-request ← CORRECT ORDER!
9. User approves via /tool-approval/:approvalId endpoint
10. Elicitation callback returns true
11. VoltAgent emits: tool-input-start, tool-input-delta, tool-input-end
12. VoltAgent executes tool
13. VoltAgent emits: tool-result
```

**Approval request appears AFTER reasoning-end** ✓

## Edge Cases to Consider

### Edge Case 1: Multiple Tool Calls in Sequence
If model calls multiple tools, each will inject its own approval request. They'll be emitted in order at chunk boundaries.

### Edge Case 2: Tool Call During Reasoning
If tool call is detected while still emitting reasoning-delta chunks, the approval request will be buffered and emitted after reasoning-end.

### Edge Case 3: Approval Timeout
If user doesn't respond, elicitation returns false, VoltAgent doesn't execute tool, no tool-input events are emitted. The approval request event is already in the stream (correct).

### Edge Case 4: Stream Abort
If client disconnects while waiting for approval, the elicitation promise should be rejected. Need to handle cleanup.

### Edge Case 5: No Reasoning Block
If there's no `<thinking>` tag, the approval request will appear after the last text-delta before the tool call. This is correct.

## Testing Checklist

- [ ] Auto-approved tool: No approval request appears, tool executes immediately
- [ ] Non-auto-approved tool: Approval request appears after reasoning-end
- [ ] Approval granted: Tool executes, tool-result appears
- [ ] Approval denied: Tool doesn't execute, appropriate error/message
- [ ] Approval timeout: Tool denied after 60s
- [ ] Multiple tools: Each approval request appears in correct order
- [ ] No reasoning block: Approval request appears after text-delta
- [ ] Client disconnect during approval: Cleanup happens properly

## Implementation Steps

1. Create `InjectableStream` class
2. Add `isAutoApproved()` helper function
3. Update elicitation callback to inject events instead of writing directly
4. Wrap `result.fullStream` with `injectableStream.wrap()`
5. Remove `ElicitationHandler` from pipeline
6. Test all scenarios

## Questions to Resolve

1. **What happens if elicitation is called multiple times before any events are emitted?**
   - Multiple approval requests would be buffered
   - They'd all be emitted at the next chunk boundary
   - Is this correct behavior?

2. **Should we inject at the NEXT chunk boundary or wait for a specific event type?**
   - Next chunk boundary: Simpler, but might appear mid-text-delta
   - Wait for text-end or reasoning-end: More complex, but cleaner boundaries
   - Recommendation: Wait for text-end or reasoning-end

3. **What if VoltAgent emits tool-input-start before we finish buffering reasoning?**
   - This shouldn't happen because elicitation blocks VoltAgent
   - But if it does, we need to ensure approval request comes first
   - Recommendation: Inject BEFORE tool-input-start specifically

4. **Should InjectableStream be part of the pipeline or wrap it externally?**
   - External wrapper: Simpler, doesn't affect pipeline logic
   - Part of pipeline: More integrated, but adds complexity
   - Recommendation: External wrapper

## Refined Implementation

```typescript
class InjectableStream {
  private buffer: StreamChunk[] = [];
  
  async *wrap(source: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    for await (const chunk of source) {
      // If we have buffered events and we're at a safe boundary, emit them
      if (this.buffer.length > 0 && this.isSafeBoundary(chunk)) {
        while (this.buffer.length > 0) {
          yield this.buffer.shift()!;
        }
      }
      
      yield chunk;
    }
    
    // Yield remaining buffered events
    while (this.buffer.length > 0) {
      yield this.buffer.shift()!;
    }
  }
  
  inject(event: StreamChunk) {
    this.buffer.push(event);
  }
  
  private isSafeBoundary(chunk: StreamChunk): boolean {
    // Emit buffered events after reasoning-end or text-end
    // This ensures approval requests don't interrupt reasoning/text blocks
    return chunk.type === 'reasoning-end' || 
           chunk.type === 'text-end' ||
           chunk.type === 'tool-input-start'; // Or right before tool events
  }
}
```

This ensures approval requests appear at clean boundaries, not in the middle of reasoning or text blocks!
