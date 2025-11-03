# Global Prompts System

Work Agent supports a global prompts library that can be referenced by workspaces and agent commands.

## Overview

Instead of defining prompts inline in multiple places, you can:
1. Create global prompts in Settings → Prompts
2. Reference them by ID in workspaces and agents
3. Reuse the same prompt across multiple contexts

## Prompt Structure

```json
{
  "id": "summarize-text",
  "name": "Summarize Text",
  "prompt": "Please provide a concise summary of: {{text}}",
  "params": [
    {
      "name": "text",
      "description": "The text to summarize",
      "required": true
    }
  ]
}
```

## Storage

Global prompts are stored in `.work-agent/prompts/` directory:
- Each prompt is a separate JSON file
- Filename matches the prompt ID
- Example: `.work-agent/prompts/summarize-text.json`

## Referencing in Workspaces

Instead of inline prompts:

```json
{
  "globalPrompts": [
    {
      "id": "help",
      "label": "Help",
      "prompt": "What can you help me with?"
    }
  ]
}
```

Use prompt references:

```json
{
  "globalPrompts": [
    {
      "id": "help",
      "label": "Help",
      "promptRef": "general-help"
    }
  ]
}
```

## Referencing in Agent Commands

Agent slash commands can reference global prompts:

```json
{
  "commands": {
    "summarize": {
      "name": "summarize",
      "description": "Summarize text",
      "promptRef": "summarize-text"
    }
  }
}
```

## Q Developer Export

When exporting agents to Q Developer format, prompts are converted to Q's "custom prompts" format:

**Work Agent format:**
```json
{
  "commands": {
    "review": {
      "promptRef": "code-review"
    }
  }
}
```

**Q Developer format:**
```json
{
  "customPrompts": [
    {
      "name": "review",
      "prompt": "Review the following code and provide feedback..."
    }
  ]
}
```

## Benefits

1. **Reusability**: Define once, use everywhere
2. **Consistency**: Same prompt across all contexts
3. **Maintainability**: Update in one place
4. **Discoverability**: Browse all prompts in settings
5. **Portability**: Export to Q Developer format

## Implementation Status

- ✅ UI for managing prompts (Settings → Prompts)
- ⏳ Backend API for CRUD operations
- ⏳ Workspace prompt references
- ⏳ Agent command prompt references
- ⏳ Q Developer export with custom prompts
- ⏳ Parameter extraction from templates
