# Nova Streaming Bug - Investigation Summary

## Root Cause ✅

**Amazon Bedrock's Nova model crashes during streaming when attempting to invoke a tool with a hyphen in its name.**

## Key Findings

### The Bug
- **Symptom**: `NGHTTP2_INTERNAL_ERROR` during streaming
- **Trigger**: Tool name contains hyphen (`-`)
- **Condition**: Nova decides to invoke that tool
- **Mode**: Streaming only

### What We Tested
1. ✅ Tool count (1-64 tools) - Not the issue
2. ✅ Schema complexity - Not the issue  
3. ✅ Token size - Not the issue
4. ✅ Schema fields (`additionalProperties`, `$schema`) - Not the issue
5. ✅ Tool name characters - **HYPHEN IS THE ISSUE**
6. ✅ Slash separator (`/`) - **ALSO CAUSES CRASHES**

### Test Results
```
❌ CRASH: sat-outlook_calendar_view
✅ WORKS: sat_outlook_calendar_view
✅ WORKS: satOutlook_calendarView

❌ CRASH: my-tool
✅ WORKS: my_tool
✅ WORKS: myTool

❌ CRASH: sat_outlook/calendar_view
✅ WORKS: sat_outlook_calendar_view
```

## The Solution

### Implementation

**Backend (Internal Only)**:
- Normalizes tool names when loading from MCP: `sat-outlook_calendar_view` → `satOutlook_calendarView`
- Stores bidirectional mapping for reverse lookup
- Nova sees normalized names (no crashes)

**Frontend (User-Facing)**:
- Receives `originalName` in all API responses
- Receives `originalToolName` in streaming events
- Always displays original names to users
- Normalization is completely transparent

### Integration Points

1. **GET /agents/:slug/tools** - includes `originalName` field
2. **GET /agents/:slug/health** - includes tools with `originalName` in integrations metadata
3. **Streaming events** - includes `originalToolName` in `tool-input-available`

No dedicated endpoint needed - original names are included wherever tools are returned.

## Impact

Your production MCP tools affected:
- `sat-outlook_*` (all Outlook tools)
- `sat-sfdc_*` (all Salesforce tools)

## Next Steps

1. **Integrate normalizer**: Apply `normalizeToolName()` when loading MCP tools in `loadAgentTools()`
2. **Test with Nova**: Verify normalized names work with streaming
3. **Update MCP servers** (optional): Modify tool registration at source
4. **Report to AWS**: File bug report with Bedrock team

## Test Files Created

- `src-server/utils/tool-name-normalizer.ts` - Normalization utility
- `test-tool-normalizer.ts` - Unit tests (all passing)
- `test-nova-comprehensive.ts` - Full test matrix
- `test-nova-camelcase.ts` - Verified camelCase works
- `NOVA_BUG_CONFIRMED.md` - Detailed findings
