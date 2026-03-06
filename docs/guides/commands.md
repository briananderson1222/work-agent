# Custom Slash Commands

Stallion supports custom slash commands per agent, allowing you to define reusable prompts with parameters.

## Overview

Custom commands are defined in an agent's `agent.json` file under the `commands` field. Each command can have:
- A name (used as `/commandname`)
- A description (shown in autocomplete)
- A prompt template with `{{parameter}}` placeholders
- Parameter definitions with types, defaults, and descriptions

## Example Agent Configuration

```json
{
  "name": "Example Agent",
  "prompt": "You are a helpful assistant.",
  "commands": {
    "summarize": {
      "name": "summarize",
      "description": "Summarize text or a topic",
      "prompt": "Please provide a concise summary of: {{text}}",
      "params": [
        {
          "name": "text",
          "description": "The text or topic to summarize",
          "required": true
        }
      ]
    },
    "explain": {
      "name": "explain",
      "description": "Explain a concept",
      "prompt": "Explain {{concept}} in {{style}} terms",
      "params": [
        {
          "name": "concept",
          "required": true
        },
        {
          "name": "style",
          "required": false,
          "default": "simple"
        }
      ]
    }
  }
}
```

## Usage

In the chat interface, type `/` to see available commands including custom ones:

```
/summarize This is a long piece of text that needs summarizing
/explain quantum computing technical
/explain blockchain
```

## Parameter Expansion

Parameters are matched positionally:
- `/command arg1 arg2` → first param gets `arg1`, second gets `arg2`
- Missing optional parameters use their default value
- Template placeholders `{{paramName}}` are replaced with values

## Command Composition

Commands can reference other commands in their prompts:

```json
{
  "review-and-summarize": {
    "name": "review-and-summarize",
    "prompt": "/review {{content}}\n\nThen /summarize the key findings",
    "params": [{"name": "content", "required": true}]
  }
}
```

## Importing Q Developer Agents

You can import agents from Amazon Q Developer CLI through the UI:

1. Open Settings (⌘,)
2. Go to the "Agents" tab
3. Click "Import from Q"
4. Select an agent from the list
5. Customize the name and slug
6. Click "Import"

The agent will be created with:
- The original Q Developer instructions as the system prompt
- Default model and guardrails
- No tools (you can add them later)
- Your custom name and slug (no prefix required)

**Note**: The import reads from `~/.aws/amazonq/cli-agents.json`. Make sure you have Q Developer CLI configured.

## Notes

- **Server restart required**: New agents and command changes require a server restart
- **Autocomplete**: Custom commands appear in the `/` autocomplete menu
- **Scoped to agent**: Each agent has its own set of custom commands
- **No nesting yet**: Commands are expanded once (no recursive expansion)
