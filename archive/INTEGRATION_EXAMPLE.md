# Tool Name Normalization Integration

## Purpose of Mapping

The mapping serves **two purposes**:

1. **Nova Compatibility**: Nova crashes when tool names contain hyphens during streaming. We normalize names to camelCase format that Nova accepts.

2. **Backwards Compatibility**: If users or prompts reference original tool names (e.g., `sat-outlook_calendar_view`), we can map them back to the normalized version.

## VoltAgent Tool Structure

VoltAgent tools are objects with a `name` property:
```typescript
interface Tool {
  name: string;           // The tool identifier
  description: string;
  execute: (args) => any;
  // ... other properties
}
```

We simply modify the `name` property before passing tools to the Agent.

## Exact Integration

### Step 1: Import the normalizer

```typescript
// In src-server/runtime/voltagent-runtime.ts
import { normalizeToolName } from '../utils/tool-name-normalizer.js';
```

### Step 2: Normalize tool names when loading MCP tools

```typescript
private async createMCPTools(
  agentSlug: string,
  toolId: string,
  toolDef: ToolDef
): Promise<Tool<any>[]> {
  // ... existing MCP setup code ...

  // Get tools from MCP server
  const tools = await mcpConfig.getTools();
  
  // ✨ NEW: Normalize tool names for Nova compatibility
  const normalizedTools = tools.map(tool => ({
    ...tool,
    name: normalizeToolName(tool.name)
  }));
  
  // Mark as connected after successful getTools
  this.mcpConnectionStatus.set(mcpKey, { connected: true });
  
  // Store integration metadata
  this.integrationMetadata.set(mcpKey, {
    type: 'mcp',
    transport: toolDef.transport,
    toolCount: normalizedTools.length,
  });

  if (isNewConfig) {
    this.logger.info('MCP tools loaded', { 
      agent: agentSlug, 
      tool: toolId, 
      count: normalizedTools.length,
      sampleNames: normalizedTools.slice(0, 3).map(t => t.name)
    });
  }

  // Always wrap tools with elicitation for approval
  const spec = await this.configLoader.loadAgent(agentSlug);
  const wrappedTools = normalizedTools.map(tool => this.wrapToolWithElicitation(tool, spec));

  return wrappedTools;
}
```

## What Happens

### Before Normalization
```typescript
// MCP server returns:
[
  { name: 'sat-outlook_calendar_view', ... },
  { name: 'sat-outlook_email_search', ... },
  { name: 'sat-sfdc_query', ... }
]

// Nova sees these names → CRASHES during streaming
```

### After Normalization
```typescript
// We transform to:
[
  { name: 'satOutlook_calendarView', ... },
  { name: 'satOutlook_emailSearch', ... },
  { name: 'satSfdc_query', ... }
]

// Nova sees these names → WORKS perfectly
```

## Do We Need Reverse Mapping?

**Only if** you need to:
1. Display original names in UI
2. Accept original names in API requests
3. Match tool names in logs/configs

### If You Need Reverse Mapping

```typescript
// Store mapping when normalizing
private toolNameMap: Map<string, string> = new Map(); // normalized → original

private async createMCPTools(...): Promise<Tool<any>[]> {
  const tools = await mcpConfig.getTools();
  
  const normalizedTools = tools.map(tool => {
    const normalized = normalizeToolName(tool.name);
    
    // Store mapping for reverse lookup
    if (normalized !== tool.name) {
      this.toolNameMap.set(normalized, tool.name);
    }
    
    return {
      ...tool,
      name: normalized
    };
  });
  
  return wrappedTools;
}

// Use mapping to get original name
getOriginalToolName(normalizedName: string): string {
  return this.toolNameMap.get(normalizedName) || normalizedName;
}
```

## Recommendation

**Start without reverse mapping** - just normalize the names. Add reverse mapping only if you discover you need it for:
- UI display
- API compatibility
- Logging/debugging

The normalization is transparent to Nova and VoltAgent - they just see valid tool names.
