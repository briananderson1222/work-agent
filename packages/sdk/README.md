# @stallion-ai/sdk

SDK for building Work Agent workspace plugins.

## Installation

```bash
npm install @stallion-ai/sdk
```

## Usage

```typescript
import { useSDK, useAgents, type WorkspaceProps } from '@stallion-ai/sdk';

export default function MyWorkspace(props: WorkspaceProps) {
  const sdk = useSDK();
  const agents = useAgents();

  const handleInvoke = async () => {
    const result = await agents.invoke(props.agentSlug, 'Hello', {
      tools: ['my-tool'],
      maxSteps: 5
    });
    console.log(result.output);
  };

  return <button onClick={handleInvoke}>Invoke</button>;
}
```

## API Reference

### AgentsAPI

- `list()` - List all agents
- `get(slug)` - Get agent by slug
- `invoke(slug, prompt, options)` - Invoke agent with prompt
- `streamInvoke(slug, prompt, options)` - Stream agent response
- `sendToChat(slug, message)` - Send message to chat dock
- `cancel(slug)` - Cancel agent execution

### ToolsAPI

- `list()` - List all tools
- `get(id)` - Get tool by ID
- `invoke(id, input)` - Invoke tool
- `getSchema(id)` - Get tool schema

### EventsAPI

- `on(event, handler)` - Subscribe to event
- `once(event, handler)` - Subscribe once
- `emit(event, data)` - Emit event
- `off(event, handler)` - Unsubscribe

### KeyboardAPI

- `registerCommand(command)` - Register keyboard shortcut

### WindowAPI

- `open(options)` - Open new window (Tauri or browser)

### WorkspaceAPI

- `getManifest()` - Get plugin manifest
- `hasCapability(capability)` - Check capability
- `requestPermission(permission)` - Request permission
- `getPermissions()` - Get granted permissions

## React Hooks

- `useSDK()` - Access full SDK
- `useAgents()` - Access AgentsAPI
- `useTools()` - Access ToolsAPI
- `useEvents()` - Access EventsAPI
- `useKeyboard()` - Access KeyboardAPI
- `useWindow()` - Access WindowAPI
- `useWorkspace()` - Access WorkspaceAPI
