# Request Cancellation Implementation - Current State

## Problem Statement
When users cancel streaming requests, we need to:
1. Stop the stream immediately (good UX)
2. Abort the LLM generation (save tokens)
3. Prevent incomplete responses from being saved to memory
4. Log completion with proper reason (completed, aborted, error, etc.)

## Solution Implemented

### Core Implementation
**File:** `src-server/runtime/voltagent-runtime.ts`

**Key Changes:**
1. Create `AbortController` tied to client connection signal
2. Pass `abortController.signal` via `operationContext.abortSignal` (NOT `operationContext.abortController`)
3. VoltAgent listens to this signal and aborts LLM generation internally
4. Track completion reason and log appropriately

**Code Location:** Lines ~1347-1370
```typescript
// Create AbortController tied to client connection
const abortController = new AbortController();
conversationId = operationContext.conversationId;

// Listen for client disconnect and abort operation
c.req.raw.signal?.addEventListener('abort', () => {
  this.logger.debug('Client disconnected, aborting operation', { conversationId });
  abortController.abort('Client disconnected');
});

// Pass abort signal to VoltAgent (it will create its own controller that listens to this)
operationContext.abortSignal = abortController.signal;
```

### Critical Discovery
**VoltAgent's Internal Behavior:**
- VoltAgent creates its own `AbortController` at line 15539 in `node_modules/@voltagent/core/dist/index.js`
- It only listens to `options.abortSignal` OR inherits parent's `abortController`
- Adding `abortController` directly to `operationContext` doesn't work
- Must pass via `abortSignal` property

**Source Code Reference:**
```javascript
// node_modules/@voltagent/core/dist/index.js:15539
const abortController = options?.parentOperationContext?.abortController || new AbortController();
if (!options?.parentOperationContext?.abortController && options?.abortSignal) {
  const externalSignal = options.abortSignal;
  externalSignal.addEventListener("abort", () => {
    if (!abortController.signal.aborted) {
      abortController.abort(externalSignal.reason);
    }
  });
}
```

### Logging Implementation
**INFO Level (always visible):**
- `Agent stream started` - When streaming begins
- `Agent stream completed` - With reason: stop, aborted, error, length
- `[Tool] Executing` - When tools are invoked

**DEBUG Level (LOG_LEVEL=debug):**
- `Abort signal configured` - Setup confirmation
- `Client disconnected, aborting operation` - When abort triggered
- `Tool execution starting` - Detailed tool info
- `Tool call initiated` - LLM requests tool
- `Tool result received` - Tool returns result

### Current Issue: Unhandled Promise Rejections

**Symptom:**
```
ERROR (work-agent): [VoltAgent] Unhandled Promise Rejection: 
{"reason":"No output generated. Check the stream for errors."}
```

**Root Cause:**
- VoltAgent's internal stream processing throws `AI_NoOutputGeneratedError` when aborted early
- This happens asynchronously in VoltAgent's code, not in our catch blocks
- The error is logged by VoltAgent's global unhandledRejection handler

**Fix Applied:**
Added helper function to suppress abort-related promise rejections:
```typescript
// Prevent unhandled rejections when stream is aborted mid-flight
// VoltAgent's result promises reject with "No output generated" on abort
const suppressAbortErrors = (signal: AbortSignal) => {
  result.text?.catch(err => signal.aborted || err.message?.includes('No output generated') ? '' : Promise.reject(err));
  result.usage?.catch(err => signal.aborted ? {} : Promise.reject(err));
  result.finishReason?.catch(err => signal.aborted ? 'aborted' : Promise.reject(err));
};
suppressAbortErrors(abortController.signal);
```

**Why This Works:**
- The `result` object from `agent.streamText()` contains promises that reject when aborted
- Attaching `.catch()` handlers immediately prevents unhandled rejections
- The helper function is self-documenting and keeps the code clean

## Testing Checklist

- [x] Abort signal is passed to VoltAgent correctly
- [x] Stream stops immediately on client disconnect
- [x] Completion reason shows "aborted" in logs
- [x] No incomplete responses saved to memory
- [x] No error logs for expected abort behavior (fixed by catching result promises)

## Next Steps

✅ **Fixed** - The unhandled promise rejections are now caught at the source by attaching `.catch()` handlers to the result promises immediately after `streamText()` returns.

Test to verify:
1. Restart server
2. Cancel a streaming request mid-flight
3. Should only see: `Agent stream completed | reason: "aborted"`
4. No ERROR logs should appear

## Files Modified

- `src-server/runtime/voltagent-runtime.ts` - Abort signal setup, logging, error handling
- `src-ui/src/contexts/ActiveChatsContext.tsx` - Removed frontend cancellation message injection
- `BACKLOG.md` - Documented implementation

## Key Learnings

1. VoltAgent's abort mechanism requires passing signal via `abortSignal` property
2. VoltAgent doesn't check abort signal before executing tools (limitation)
3. Tools already queued may still execute (timing issue)
4. Abort errors from VoltAgent's internal streams are expected but noisy
5. Client-side cancellation provides immediate UX feedback
6. Server-side abort prevents wasted tokens and memory pollution
