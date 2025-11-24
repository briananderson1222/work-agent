# AI SDK Compliance

## Summary

✅ **Our tool name normalization is fully compliant with AI SDK and VoltAgent.**

## What We're Doing

1. **Modifying tool names** before passing to VoltAgent/AI SDK
2. **Normalized format**: `satOutlook_calendarView` instead of `sat-outlook_calendar_view`
3. **Tool objects remain unchanged** except for the `name` property value

## AI SDK Requirements

### Tool Interface
```typescript
interface Tool {
  name: string;           // ✅ We only change the value, not the structure
  description: string;
  parameters: any;
  execute: Function;
}
```

**AI SDK has NO validation on tool name format** - any string is valid.

### Streaming Events
```typescript
type ToolCall = {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;      // ✅ Just a string, no format requirements
  input: unknown;
}
```

**AI SDK expects `toolName` as a string** - our normalized names work perfectly.

## Flow Diagram

```
MCP Server
  ↓ Returns tools with original names
  │ (sat-outlook_calendar_view)
  ↓
Our Normalization
  ↓ Normalizes to camelCase
  │ (satOutlook_calendarView)
  ↓
VoltAgent
  ↓ Registers tools with normalized names
  │
  ↓
AI SDK
  ↓ Sends tool definitions to Bedrock
  │ (uses normalized names)
  ↓
Bedrock/Nova
  ↓ Sees normalized names (no hyphens)
  │ ✅ No crash!
  ↓
Nova invokes tool
  ↓ Uses normalized name
  │ (satOutlook_calendarView)
  ↓
VoltAgent
  ↓ Finds tool by normalized name
  │ Executes successfully
  ↓
Result returned
```

## What We're NOT Changing

- ❌ Tool interface structure
- ❌ Tool execution logic
- ❌ Streaming event format
- ❌ AI SDK behavior

## What We ARE Changing

- ✅ Tool name values (string content only)
- ✅ Adding metadata fields in our API responses (server, toolName)

## Compliance Checklist

- ✅ Tool objects have valid `name` property (string)
- ✅ Tool objects have `execute` function
- ✅ Tool objects have `description` and `parameters`
- ✅ Streaming events use `toolName` field (string)
- ✅ Tool invocation uses the same name format
- ✅ No breaking changes to AI SDK interfaces

## Additional Metadata

Our API responses include **extra fields** that AI SDK doesn't use:

```json
{
  "name": "satOutlook_calendarView",
  "originalName": "sat-outlook_calendar_view",
  "server": "sat-outlook",
  "toolName": "calendar_view"
}
```

These are **for frontend display only** and don't affect AI SDK operation.

## Conclusion

Our normalization is a **transparent transformation** that:
1. Happens before tools reach AI SDK
2. Maintains all required interfaces
3. Adds no breaking changes
4. Solves the Nova streaming crash
5. Is fully compliant with AI SDK and VoltAgent
