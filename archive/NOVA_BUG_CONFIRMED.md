# Nova Streaming Bug: Confirmed Root Cause

## Summary

**Amazon Bedrock's Nova model crashes during streaming when attempting to invoke a tool with a hyphen in its name.**

## Root Cause

- **Trigger**: Tool name contains hyphen character (`-`)
- **Condition**: Nova decides to invoke that tool
- **Mode**: Streaming only (non-streaming has different error)
- **Error**: `NGHTTP2_INTERNAL_ERROR` - HTTP/2 stream closed by server

## Test Results

### ✅ Works Fine
- Tool names with underscores: `my_tool`, `sat_outlook_calendar_view`
- Hyphenated tools when NOT invoked (vague prompts)
- Non-streaming mode (but produces validation error instead)

### ❌ Crashes
- `my-tool` when explicitly instructed to use it
- `sat-outlook_calendar_view` when Nova decides to invoke it
- `weather-tool` when explicitly instructed
- Any hyphenated tool name + streaming + tool invocation

## Reproduction

```typescript
const tools = [{
  toolSpec: {
    name: 'my-tool',  // ← Hyphen causes crash
    description: 'Test tool',
    inputSchema: {
      json: {
        type: 'object',
        properties: { input: { type: 'string' } }
      }
    }
  }
}];

const command = new ConverseStreamCommand({
  modelId: 'us.amazon.nova-pro-v1:0',
  messages: [{ role: 'user', content: [{ text: 'Use my-tool' }] }],
  toolConfig: { tools }
});

// Result: NGHTTP2_INTERNAL_ERROR
```

## Why Original Tests Were Confusing

1. **Tool count**: Not the issue - even 1 hyphenated tool crashes
2. **Schema complexity**: Not the issue - simple schemas crash too
3. **Token size**: Not the issue - tiny tools crash
4. **`additionalProperties`/`$schema`**: Not the issue

The issue was **always the hyphen in the tool name**, but only manifested when:
- Nova decided to invoke the tool (not just having it available)
- Streaming mode was enabled

## Workaround

Replace hyphens with underscores in tool names:

```typescript
// ❌ Crashes
name: 'sat-outlook_calendar_view'

// ✅ Works
name: 'sat_outlook_calendar_view'
```

## Impact on Production

Your production agent has tools like:
- `sat-outlook_calendar_view` ← Crashes
- `sat-outlook_email_search` ← Crashes
- `sat-sfdc_query` ← Crashes

All MCP tools with `sat-outlook` and `sat-sfdc` prefixes use hyphens.

## Next Steps

1. **Immediate fix**: Rename all tools to use underscores instead of hyphens
2. **Report to AWS**: This is a Bedrock bug that needs fixing
3. **Update MCP servers**: Modify tool registration to avoid hyphens

## Test Files

- `test-nova-comprehensive.ts` - Full test matrix
- `test-nova-tool-invocation.ts` - Confirms invocation trigger
- `test-nova-hyphen-confirm.ts` - Isolates hyphen issue
