# Nova Streaming Debug Guide

## Problem Summary

Nova model (`us.amazon.nova-pro-v1:0`) terminates mid-stream when tools are enabled. The connection closes during text generation that mentions the tool name, before any `toolUse` chunk is sent.

**Error:** `TypeError: terminated: other side closed` - Bedrock closes the TCP connection.

## Hypothesis

Nova's streaming implementation has a bug when transitioning from text generation to tool invocation. The model decides to use a tool, generates explanatory text about it, then crashes before emitting the tool-use chunk.

## Debug Test Suite

Run all tests: `./run-debug-tests.sh`

### Test Files

1. **test-nova-no-tools.ts** - Baseline test without tools
   - Verifies Nova streaming works without tool config
   - Same message length to rule out content issues

2. **test-bedrock-raw.ts** - Raw AWS SDK test with tools
   - Bypasses VoltAgent and AI SDK layers
   - Direct AWS SDK ConverseStreamCommand
   - Isolates if issue is in our code or Bedrock

3. **test-claude-comparison.ts** - Claude with same tool config
   - Captures working stream for comparison
   - Saves to `.claude-stream-capture.json`
   - Shows expected tool invocation flow

4. **test-socket-debug.ts** - TCP socket monitoring
   - Patches https.request to log socket events
   - Tracks connection state, timeouts, errors
   - Detects if Bedrock closes or client aborts

5. **test-parser-safety.ts** - Stream parser error boundaries
   - Catches malformed chunks that crash parser
   - Saves raw events to `.nova-parser-safety.json`
   - Identifies last successful chunk before failure

### Enhanced Logging in bedrock.ts

- Captures full request/response to `.bedrock-debug-*` files
- Logs every chunk with size and preview
- Tracks stream errors and termination

## What to Look For

### 1. Socket Events
```
[SOCKET] End event (remote closed)  <- Bedrock closed connection
[SOCKET] Close event, hadError: true <- Error during close
```

### 2. Stream Termination Pattern
- Nova generates text: `<thinking> To provide... I need to use the `sat-`
- Connection terminates mid-word
- No `contentBlockStart` with `toolUse` is ever sent

### 3. Comparison with Claude
- Claude sends `contentBlockStart` with `toolUse` object
- Claude completes tool invocation successfully
- Nova never reaches this point

### 4. Malformed Chunks
Check `.nova-parser-safety.json` for:
- Incomplete JSON in event stream
- Missing required fields
- Unexpected event types

## Expected Outcomes

### If Nova works without tools:
- Issue is specifically tool-related
- Not a general streaming problem

### If raw AWS SDK fails:
- Issue is in Bedrock service, not our code
- Report to AWS as Nova streaming bug

### If socket shows "remote closed":
- Bedrock server is terminating connection
- Not a client-side timeout or abort

### If parser catches malformed chunk:
- Nova sends invalid event-stream data
- Parser crashes before connection closes

## Next Steps Based on Results

### Scenario A: Raw SDK fails, no tools works
**Conclusion:** Nova streaming + tools is broken in Bedrock
**Action:** Implement fallback to non-streaming for Nova + tools

### Scenario B: Malformed chunk detected
**Conclusion:** Nova sends invalid event-stream format
**Action:** Add parser workaround or report to AWS

### Scenario C: Socket shows unexpected close
**Conclusion:** Bedrock terminates connection prematurely
**Action:** Report to AWS with socket logs

### Scenario D: All tests fail
**Conclusion:** Nova streaming is fundamentally broken
**Action:** Disable Nova streaming entirely

## Workaround Implementation

If confirmed as Bedrock bug, add to `src-server/providers/bedrock.ts`:

```typescript
// Detect Nova + tools and disable streaming
if (model.includes('nova') && hasTools) {
  console.warn('[BEDROCK] Nova + tools detected, using non-streaming mode');
  // Use converse instead of converse-stream
}
```

## Files Generated

- `.bedrock-debug-*-request.json` - Full request payload
- `.bedrock-debug-*-response.json` - Complete stream capture
- `.claude-stream-capture.json` - Working Claude stream
- `.nova-parser-safety.json` - Raw events with error boundaries
- `.nova-parser-error.json` - Parser errors if any

## Reporting to AWS

Include:
1. Socket logs showing remote close
2. Raw stream capture showing termination point
3. Comparison with working Claude stream
4. Minimal reproduction (test-bedrock-raw.ts)
5. Request/response payloads
