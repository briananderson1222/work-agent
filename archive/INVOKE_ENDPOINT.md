# New `/invoke` Endpoint

## Overview

Lightweight endpoint for multi-turn tool calling with structured output. **No agent concept needed** - just specify tools, model, and schema.

## Key Features

- ✅ **No agent dependency** - Direct AI SDK calls
- ✅ **Tool filtering** - Specify exact tools to use
- ✅ **Multi-turn tool calling** - Model decides when to call tools
- ✅ **Structured output** - Automatic JSON formatting via `generateObject`
- ✅ **Fast structuring** - Optional separate model for JSON phase
- ✅ **Custom system prompt** - Override default instructions

## Endpoint

```
POST /invoke
```

## Request Body

```typescript
{
  prompt: string;              // User request
  schema?: object;             // JSON schema for structured output
  tools?: string[];            // Tool names to make available
  maxSteps?: number;           // Max tool calling rounds (default: 10)
  model?: string;              // Model ID for main execution
  structureModel?: string;     // Fast model for structuring (optional)
  system?: string;             // Custom system prompt (optional)
}
```

## Response

```typescript
{
  success: boolean;
  response: string | object;   // Text or structured object
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  steps: number;               // Number of tool calling rounds
  error?: string;
}
```

## How It Works

### Phase 1: Tool Execution
```typescript
const textResult = await generateText({
  model: mainModel,
  system: 'You are a helpful assistant...',
  prompt,
  tools: filteredTools,
  maxSteps
});
```

### Phase 2: Structured Output (if schema provided)
```typescript
const objectResult = await generateObject({
  model: fastModel || mainModel,  // Use fast model if provided
  messages: [...textResult.messages, 'Format as JSON'],
  schema: jsonSchema(schema)
});
```

## Examples

### 1. Simple Text Response

```bash
curl -X POST http://localhost:3141/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is 2+2?",
    "maxSteps": 1
  }'
```

Response:
```json
{
  "success": true,
  "response": "2+2 = 4",
  "usage": { "totalTokens": 47 },
  "steps": 1
}
```

### 2. With Tools (No Schema)

```bash
curl -X POST http://localhost:3141/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Get my calendar events for today",
    "tools": ["sat-outlook_calendar_view"],
    "maxSteps": 5
  }'
```

Response:
```json
{
  "success": true,
  "response": "Here are your events for today:\n- 9am: Team standup\n- 2pm: Client meeting",
  "usage": { "totalTokens": 234 },
  "steps": 2
}
```

### 3. With Tools + Schema

```bash
curl -X POST http://localhost:3141/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Get my calendar events for today",
    "tools": ["sat-outlook_calendar_view"],
    "schema": {
      "type": "object",
      "properties": {
        "events": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "title": { "type": "string" },
              "start": { "type": "string" },
              "end": { "type": "string" }
            }
          }
        }
      }
    },
    "maxSteps": 5
  }'
```

Response:
```json
{
  "success": true,
  "response": {
    "events": [
      { "title": "Team standup", "start": "9:00 AM", "end": "9:30 AM" },
      { "title": "Client meeting", "start": "2:00 PM", "end": "3:00 PM" }
    ]
  },
  "usage": { "totalTokens": 456 },
  "steps": 2
}
```

### 4. With Fast Structure Model

```bash
curl -X POST http://localhost:3141/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the capital of France?",
    "schema": {
      "type": "object",
      "properties": {
        "capital": { "type": "string" },
        "country": { "type": "string" }
      }
    },
    "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
    "structureModel": "anthropic.claude-3-haiku-20240307-v1:0"
  }'
```

Response:
```json
{
  "success": true,
  "response": {
    "capital": "Paris",
    "country": "France"
  },
  "usage": { "totalTokens": 123 },
  "steps": 1
}
```

## Comparison with `/agents/:slug/invoke`

| Feature | `/invoke` (New) | `/agents/:slug/invoke` (Old) |
|---------|-----------------|------------------------------|
| Agent required | ❌ No | ✅ Yes |
| Tool filtering | ✅ Yes | ✅ Yes |
| Multi-turn tools | ✅ Yes | ⚠️ Partial |
| Structured output | ✅ Native `generateObject` | ⚠️ Manual parsing |
| Fast structuring | ✅ Separate model | ❌ No |
| Custom system | ✅ Yes | ❌ Uses agent prompt |
| Conversation memory | ❌ No (temp only) | ✅ Yes |

## Use Cases

### UI Data Fetching
```typescript
// Calendar component
const response = await fetch('/invoke', {
  method: 'POST',
  body: JSON.stringify({
    prompt: 'Get calendar events and SFDC opportunities',
    tools: ['sat-outlook_calendar_view', 'sat-sfdc_query'],
    schema: calendarSchema,
    structureModel: 'anthropic.claude-3-haiku-20240307-v1:0'
  })
});
```

### Quick Actions
```typescript
// Dashboard widget
const response = await fetch('/invoke', {
  method: 'POST',
  body: JSON.stringify({
    prompt: 'Summarize my unread emails',
    tools: ['sat-outlook_email_list'],
    schema: { type: 'object', properties: { count: { type: 'number' } } }
  })
});
```

### Background Tasks
```typescript
// Scheduled job
const response = await fetch('/invoke', {
  method: 'POST',
  body: JSON.stringify({
    prompt: 'Check for high-priority tickets',
    tools: ['jira_search'],
    schema: ticketSchema,
    system: 'You are a ticket triage assistant. Focus on P0/P1 issues.'
  })
});
```

## Performance Tips

1. **Use `structureModel`** for faster JSON formatting (Haiku is 3x faster than Sonnet)
2. **Limit `maxSteps`** to avoid unnecessary tool rounds
3. **Filter tools** to only what's needed (faster model selection)
4. **Cache results** in your UI layer for repeated queries

## Implementation Details

- Uses AI SDK's `generateText` for tool calling phase
- Uses AI SDK's `generateObject` for structuring phase
- No conversation persistence (temp conversation ID)
- Tools loaded from all agents' tool registries
- Models resolved via `BedrockModelCatalog`

## Testing

Run the test script:
```bash
npx tsx test-invoke.ts
```

Or use the provided examples above with `curl`.
