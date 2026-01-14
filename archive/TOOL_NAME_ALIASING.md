# Tool Name Aliasing System

## Problem

Amazon Bedrock's Nova model crashes during streaming when tool names contain hyphens (`-`). This affects 3rd-party MCP tools that use hyphenated names like `sat-outlook_calendar_view`.

## Solution

**Transparent bidirectional aliasing** - tool names are automatically normalized for Nova compatibility while preserving original names for display and user references.

## How It Works

### 1. Automatic Normalization

When MCP tools are loaded, names are automatically normalized:

```typescript
// Original MCP tool name
'sat-outlook_calendar_view'

// Automatically normalized to
'satOutlook_calendarView'
```

### 2. Bidirectional Mapping

The system maintains a mapping between original and normalized names:

```typescript
{
  normalized: 'satOutlook_calendarView',
  original: 'sat-outlook_calendar_view'
}
```

### 3. Transparent to Users

- **Nova sees**: `satOutlook_calendarView` (works perfectly)
- **Users see**: `sat-outlook_calendar_view` (original name)
- **Logs show**: Original names for clarity
- **API accepts**: Both original and normalized names

## Normalization Rules

Format: `<serverNameInCamelCase>_<toolNameInCamelCase>`

- Hyphens → camelCase: `sat-outlook` → `satOutlook`
- Underscores within parts → camelCase: `calendar_view` → `calendarView`
- First underscore preserved as separator

### Examples

```typescript
'sat-outlook_calendar_view'  → 'satOutlook_calendarView'
'sat-outlook_email_search'   → 'satOutlook_emailSearch'
'sat-sfdc_query'             → 'satSfdc_query'
'sat-sfdc_get_account'       → 'satSfdc_getAccount'
'my-tool'                    → 'myTool'
'simple_tool'                → 'simple_tool' (no change)
```

## API Usage

### Get Tool Mappings

```bash
GET /tools/mappings

Response:
{
  "success": true,
  "data": [
    {
      "original": "sat-outlook_calendar_view",
      "normalized": "satOutlook_calendarView"
    },
    {
      "original": "sat-sfdc_query",
      "normalized": "satSfdc_query"
    }
  ]
}
```

### Reference Tools by Original Name

Users can reference tools using original names in:
- Agent configurations (`tools.available`, `tools.autoApprove`)
- API requests
- Prompts and documentation

The system automatically maps to normalized names internally.

## Benefits

1. **No Breaking Changes**: Existing configs and prompts continue to work
2. **3rd-Party Compatible**: Works with any MCP tool without modification
3. **Nova Compatible**: Prevents streaming crashes
4. **User Friendly**: Users see familiar tool names
5. **Transparent**: Aliasing happens automatically

## Implementation Details

### Runtime Storage

```typescript
private toolNameMapping: Map<string, { original: string; normalized: string }> = new Map();
```

### Helper Methods

```typescript
// Get original name from normalized
getOriginalToolName(normalizedName: string): string

// Get normalized name from original
getNormalizedToolName(originalName: string): string
```

### Logging

Tool normalization is logged at debug level:

```
Tool name normalized: sat-outlook_calendar_view → satOutlook_calendarView
```

## Future Considerations

### Custom Aliases

If needed, could extend to support custom aliases in agent config:

```json
{
  "tools": {
    "aliases": {
      "calendar": "satOutlook_calendarView",
      "email": "satOutlook_emailSearch"
    }
  }
}
```

### Display Names

Could add display names separate from tool identifiers:

```json
{
  "name": "satOutlook_calendarView",
  "displayName": "Outlook Calendar View",
  "originalName": "sat-outlook_calendar_view"
}
```

## Testing

Run the test suite to verify normalization:

```bash
npx tsx test-tool-normalizer.ts
```

All 7 test cases should pass.
