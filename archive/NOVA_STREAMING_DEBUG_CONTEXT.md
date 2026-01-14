# Nova Streaming + Tools Debug Context

## Problem Statement
Amazon Bedrock's Nova model (`us.amazon.nova-pro-v1:0`) crashes during streaming when tools are present. The connection terminates mid-stream with `NGHTTP2_INTERNAL_ERROR` before any tool invocation occurs.

## System Architecture
```
Application Code
  ↓
VoltAgent (agent framework)
  ↓
Vercel AI SDK (@ai-sdk/amazon-bedrock v3.0.56)
  ↓
AWS SDK (@aws-sdk/client-bedrock-runtime)
  ↓
Amazon Bedrock
```

## What We've Confirmed

### ✅ Tool Schema Format is CORRECT
All tools have the proper `inputSchema.json` wrapper required by Nova:
```json
{
  "toolSpec": {
    "name": "tool_name",
    "description": "...",
    "inputSchema": {
      "json": {  // ← This wrapper IS present
        "type": "object",
        "properties": { ... }
      }
    }
  }
}
```

Verified by:
- Inspecting actual Bedrock requests in `.bedrock-debug-*-request.json` files
- Checking AI SDK source code (line 266 in `@ai-sdk/amazon-bedrock/dist/index.js`)
- Testing with raw AWS SDK - schema format is correct

### ✅ Nova Streaming Works WITHOUT Tools
Test: `test-nova-no-tools.ts`
- Result: SUCCESS
- 257 chunks received
- 2,765 characters generated
- No errors

### ✅ Nova + Tools Works with Simple Schema (1 tool)
Test: `test-nova-correct-schema.ts`
- Result: SUCCESS (both streaming and non-streaming)
- Tool: `get_weather` with simple schema
- Streaming: 43 chunks, tool invocation successful
- Non-streaming: Tool invocation successful

### ❌ Nova + Tools FAILS with Production Agent (64 tools)
Test: Production agent `stallion-workspace:work-agent`
- Result: FAILURE
- Error: `NGHTTP2_INTERNAL_ERROR` - HTTP/2 stream closed by server
- Crash point: After generating ~43 chunks of text mentioning the tool name
- No `toolUse` chunk ever sent

### ✅ Claude + Tools Works Perfectly (64 tools)
Test: Same agent with Claude model
- Result: SUCCESS
- Generates text, sends `contentBlockStop`, then `contentBlockStart` with `toolUse`
- Completes tool invocation successfully

## Error Details

**Error Message:**
```
Error [ERR_HTTP2_STREAM_ERROR]: Stream closed with error code NGHTTP2_INTERNAL_ERROR
    at ClientHttp2Stream._destroy (node:internal/http2/core:2377:13)
    at Http2Stream.onStreamClose (node:internal/http2/core:559:12)
```

**Crash Pattern:**
1. Nova receives request with 64 tools
2. Starts streaming text response
3. Generates: `<thinking> To find out what is on the user's calendar for today, I need to use the 'sat-outlook_calendar_view' tool...`
4. After ~43 chunks (209 characters), HTTP/2 connection closes
5. No `contentBlockStop` or `contentBlockStart` with `toolUse` is ever sent

**What This Means:**
- `NGHTTP2_INTERNAL_ERROR` = Bedrock's HTTP/2 server crashed
- Error originates from Amazon's infrastructure, not client code
- Nova model crashes when attempting to transition from text → tool invocation

## Test Files Created

1. **test-nova-no-tools.ts** - Baseline without tools (works)
2. **test-bedrock-raw.ts** - Raw AWS SDK with 1 tool (works)
3. **test-nova-nonstreaming.ts** - Non-streaming with 1 tool (works)
4. **test-nova-correct-schema.ts** - Streaming with correct schema (works)
5. **test-claude-comparison.ts** - Claude with same setup (works)
6. **test-socket-debug.ts** - TCP socket monitoring
7. **test-parser-safety.ts** - Stream parser error boundaries

## Key Findings

### Tool Count Hypothesis
- 1 tool: ✅ Works
- 64 tools: ❌ Crashes
- **Hypothesis:** Nova cannot handle large tool catalogs during streaming

### Schema Format
- **NOT the issue** - All schemas have correct `json` wrapper
- Verified in actual Bedrock requests
- AI SDK correctly converts VoltAgent tools

### Streaming vs Non-Streaming
- Streaming with 1 tool: ✅ Works
- Non-streaming with 1 tool: ✅ Works
- Streaming with 64 tools: ❌ Crashes
- **Issue is specific to streaming + many tools**

## Internal AWS Tickets Found
- **P215222216**: "Bedrock errors when using attachments (PDF) with tools and Nova"
- Related to Nova tool invocation issues
- Status: Known internal issue

## ✅ ROOT CAUSE CONFIRMED

**Nova crashes during streaming when attempting to invoke a tool with a hyphen (`-`) in its name.**

### The Issue
- **Trigger**: Tool name contains hyphen character (e.g., `sat-outlook_calendar_view`)
- **Condition**: Nova decides to invoke that tool
- **Mode**: Streaming only (non-streaming produces validation error instead)
- **Error**: `NGHTTP2_INTERNAL_ERROR` - HTTP/2 stream closed by server

### What We Ruled Out
- ❌ Tool count (even 1 hyphenated tool crashes)
- ❌ Schema complexity (simple schemas crash too)
- ❌ Token size (tiny tools crash)
- ❌ `additionalProperties` or `$schema` fields
- ❌ Tool description length
- ❌ Prompt type

### Test Results
- ✅ `my_tool` - Works
- ❌ `my-tool` - Crashes when invoked
- ✅ `sat_outlook_calendar_view` - Works
- ❌ `sat-outlook_calendar_view` - Crashes when invoked

### The Fix
Replace all hyphens with underscores in tool names:
```typescript
// ❌ Crashes
name: 'sat-outlook_calendar_view'

// ✅ Works  
name: 'sat_outlook_calendar_view'
```

## Reproduction Steps

1. Start server: `npm run dev:server`
2. Send request to agent with 64 tools:
```bash
curl -X POST 'http://localhost:3141/api/agents/stallion-workspace:work-agent/chat' \
  -H "Content-Type: application/json" \
  -d '{"message": "What is on my calendar for today?", "conversationId": "test-123"}'
```
3. Observe stream termination after ~43 chunks

## Debug Logging Added

**In `src-server/providers/bedrock.ts`:**
- Captures full request to `.bedrock-debug-*-request.json`
- Captures full response stream to `.bedrock-debug-*-response.json`
- Logs every chunk with size and preview
- Tracks stream errors and termination

**In `src-server/runtime/voltagent-runtime.ts`:**
- Logs tool count after filtering
- Logs fixed token counts (system prompt + tools)
- Example: `mcpServerTokens: 13836` for 64 tools

## Workaround Options

### Option 1: Disable Streaming for Nova + Tools
```typescript
if (model.includes('nova') && tools.length > THRESHOLD) {
  // Use non-streaming converse API
}
```

### Option 2: Limit Tool Count for Nova
```typescript
if (model.includes('nova')) {
  tools = tools.slice(0, MAX_TOOLS_FOR_NOVA);
}
```

### Option 3: Use Claude for Tool-Heavy Agents
Switch to Claude when many tools are needed

## Questions to Answer

1. **What is the exact tool count threshold where Nova breaks?**
2. **Does non-streaming work with 64 tools?**
3. **Is it tool count or total token size of tool schemas?**
4. **Does Nova have a documented tool limit?**
5. **Is this a known Bedrock bug with a fix timeline?**

## Files to Check

- `.work-agent/agents/stallion-workspace:work-agent/agent.json` - Agent with 64 tools
- `.work-agent/agents/test-nova-limited-tools/agent.json` - Agent with 1 tool
- `src-server/providers/bedrock.ts` - Bedrock provider with debug logging
- `src-server/runtime/voltagent-runtime.ts` - Tool loading and filtering

## Next Steps

1. Test with incrementally more tools (5, 10, 20, 40, 64)
2. Test non-streaming with 64 tools
3. Calculate total token size of tool schemas
4. Check AWS documentation for Nova tool limits
5. Report to AWS with reproduction case if confirmed as Bedrock bug
