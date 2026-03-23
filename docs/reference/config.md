# config reference

Configuration for Stallion lives in `~/.stallion-ai/`. Two files drive most behavior: `config/app.json` for global settings and `agents/<slug>/agent.json` per agent.

For usage context, see [docs/guides/agents.md](../guides/agents.md).

---

## app.json

**Location:** `~/.stallion-ai/config/app.json`

Global settings applied across all agents and sessions.

### required fields

| field | type | description |
|---|---|---|
| `region` | string | AWS region for Bedrock (e.g. `us-east-1`) |
| `defaultModel` | string | Default Bedrock model ID used when an agent doesn't specify one |
| `invokeModel` | string | Model used for `/invoke` endpoint tool calling |
| `structureModel` | string | Model used for `/invoke` endpoint structured output |

### optional fields

| field | type | default | description |
|---|---|---|---|
| `defaultMaxTurns` | number | `10` | Maximum agentic turns before a conversation is halted |
| `defaultMaxOutputTokens` | number | `16384` | Maximum tokens in a single model response |
| `systemPrompt` | string | — | Global system prompt prepended to every agent's instructions |
| `templateVariables` | array | `[]` | Named variables available for `{{key}}` substitution in prompts |
| `defaultChatFontSize` | number | `14` | Chat UI font size in pixels (10–24) |
| `registryUrl` | string | — | URL for the plugin registry |
| `runtime` | `"voltagent"` \| `"strands"` | `"strands"` | Agent framework runtime |
| `gitRemote` | string | — | Git remote URL, resolved on first build for update checks |

### templateVariables

Each entry in `templateVariables` defines a `{{key}}` replacement available in any prompt.

| field | type | description |
|---|---|---|
| `key` | string | Variable name used as `{{key}}` in prompts |
| `type` | `"static"` \| `"date"` \| `"time"` \| `"datetime"` \| `"custom"` | How the value is resolved |
| `value` | string | The value (required for `static` and `custom`) |
| `format` | string | JSON format options for date/time types |

### complete example

```json
{
  "region": "us-east-1",
  "defaultModel": "anthropic.claude-3-5-sonnet-20240620-v1:0",
  "invokeModel": "us.amazon.nova-2-lite-v1:0",
  "structureModel": "us.amazon.nova-micro-v1:0",
  "defaultMaxTurns": 15,
  "defaultMaxOutputTokens": 16384,
  "systemPrompt": "You are working in the {{project}} project. Today is {{date}}.",
  "templateVariables": [
    { "key": "project", "type": "static", "value": "my-app" },
    { "key": "date", "type": "date", "format": "YYYY-MM-DD" }
  ],
  "defaultChatFontSize": 14,
  "registryUrl": "https://registry.example.com"
}
```

---

## agent.json

**Location:** `~/.stallion-ai/agents/<slug>/agent.json`

Defines a single agent. The directory name is the agent's slug.

### top-level fields

| field | type | required | description |
|---|---|---|---|
| `name` | string | yes | Display name shown in the UI |
| `prompt` | string | yes | System prompt for this agent. Supports `{{key}}` template variables |
| `description` | string | no | Short description shown in agent pickers |
| `icon` | string | no | Icon identifier for the UI |
| `model` | string | no | Bedrock model ID. Falls back to `defaultModel` from app.json |
| `region` | string | no | AWS region override for this agent |
| `maxTurns` | number | no | Turn limit override. Falls back to `defaultMaxTurns` |
| `tools` | object | no | Tool and MCP server configuration |
| `guardrails` | object | no | Model inference constraints |
| `commands` | object | no | Slash commands available in this agent's chat |
| `ui` | object | no | UI configuration including quick prompts |

### tools

Controls which MCP servers and tools the agent can use.

| field | type | description |
|---|---|---|
| `mcpServers` | string[] | IDs of MCP server tools to connect (defined in `~/.stallion-ai/integrations/<id>/tool.json`) |
| `available` | string[] | Allowlist of specific tool names exposed to the agent. Empty means all tools from connected servers |
| `autoApprove` | string[] | Tool names that execute without user confirmation |
| `aliases` | object | Map of `{ "alias": "actual-tool-name" }` for renaming tools in prompts |

### guardrails

Inference parameters applied to every model call for this agent.

| field | type | description |
|---|---|---|
| `maxTokens` | number | Maximum output tokens (overrides `defaultMaxOutputTokens`) |
| `maxSteps` | number | Maximum agentic steps per turn |
| `temperature` | number | Sampling temperature (0–1) |
| `topP` | number | Nucleus sampling probability |
| `stopSequences` | string[] | Sequences that halt generation |

### ui / quickPrompts

`ui.quickPrompts` surfaces one-click prompts in the chat interface.

| field | type | description |
|---|---|---|
| `id` | string | Unique identifier |
| `label` | string | Button label shown in the UI |
| `prompt` | string | Prompt text sent when clicked |
| `agent` | string | Optional agent slug to route the prompt to |

### complete example

```json
{
  "name": "Code Reviewer",
  "description": "Reviews code for correctness, style, and security issues",
  "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
  "prompt": "You are an expert code reviewer working on {{project}}. Review code for correctness, security, and adherence to best practices. Be concise and actionable.",
  "maxTurns": 20,
  "tools": {
    "mcpServers": ["filesystem", "github"],
    "available": ["read_file", "list_directory", "create_pull_request", "get_pull_request"],
    "autoApprove": ["read_file", "list_directory"]
  },
  "guardrails": {
    "maxTokens": 8192,
    "maxSteps": 30,
    "temperature": 0.3
  },
  "ui": {
    "quickPrompts": [
      {
        "id": "review-pr",
        "label": "Review open PR",
        "prompt": "Review the most recently opened pull request and summarize findings."
      },
      {
        "id": "security-scan",
        "label": "Security scan",
        "prompt": "Scan the current directory for common security vulnerabilities."
      }
    ]
  }
}
```
