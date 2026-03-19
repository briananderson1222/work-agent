# @stallion-ai/sdk

SDK for building Stallion workspace plugins with consistent UI components and API access.

## Installation

```bash
npm install @stallion-ai/sdk
```

## UI Components

The SDK provides pre-built, theme-aware components for consistent styling across workspaces.

### Button

```tsx
import { Button } from '@stallion-ai/sdk';

function MyComponent() {
  return (
    <>
      <Button variant="primary" onClick={handleClick}>
        Primary Action
      </Button>
      
      <Button variant="secondary" size="sm">
        Secondary
      </Button>
      
      <Button variant="success" loading={isLoading}>
        Save Changes
      </Button>
      
      <Button variant="ghost" disabled>
        Disabled
      </Button>
    </>
  );
}
```

**Props:**
- `variant`: `'primary' | 'secondary' | 'success' | 'ghost'` (default: `'primary'`)
- `size`: `'sm' | 'md' | 'lg'` (default: `'md'`)
- `loading`: `boolean` - Shows loading state
- All standard button HTML attributes

### Pill

```tsx
import { Pill } from '@stallion-ai/sdk';

function MyComponent() {
  return (
    <>
      <Pill variant="primary">Active</Pill>
      
      <Pill variant="success">Completed</Pill>
      
      <Pill variant="warning">Pending</Pill>
      
      <Pill variant="error">Failed</Pill>
      
      <Pill 
        variant="default" 
        removable 
        onRemove={() => console.log('removed')}
      >
        Removable Tag
      </Pill>
    </>
  );
}
```

**Props:**
- `variant`: `'default' | 'primary' | 'success' | 'warning' | 'error'` (default: `'default'`)
- `size`: `'sm' | 'md'` (default: `'md'`)
- `removable`: `boolean` - Shows remove button
- `onRemove`: `() => void` - Called when remove button is clicked
- All standard span HTML attributes

## Hooks

### Agent Management

```tsx
import { useAgents, useAgent } from '@stallion-ai/sdk';

const agents = useAgents();
const agent = useAgent('my-agent');
```

### Chat Operations

```tsx
import { useSendMessage, useCreateChatSession } from '@stallion-ai/sdk';

const sendMessage = useSendMessage();
const createSession = useCreateChatSession();

// Send a message
sendMessage('Hello, agent!');

// Create a new chat session
createSession('my-agent');
```

### Navigation

```tsx
import { useNavigation, useDockState } from '@stallion-ai/sdk';

const { setDockState } = useNavigation();
const [isDockOpen] = useDockState();

// Open chat dock
setDockState(true);
```

### Notifications

```tsx
import { useToast, useNotifications } from '@stallion-ai/sdk';

const { showToast } = useToast();
const { notify } = useNotifications();

showToast('Success!', 'success');
notify({ title: 'New message', message: 'You have a new message' });
```

### Tool Invocation

```tsx
import { callTool, invokeAgent } from '@stallion-ai/sdk';

// Call an MCP tool directly
const result = await callTool('my-agent', 'tool-name', { param: 'value' });

// Invoke agent silently
const response = await invokeAgent('my-agent', 'Do something');
```

## Layout Navigation

```tsx
import { useLayoutNavigation } from '@stallion-ai/sdk';

const { getTabState, setTabState } = useLayoutNavigation();

// Save state
setTabState('my-tab', 'key=value&other=data');

// Restore state
const state = getTabState('my-tab');
```

## Theme Variables

All components use CSS variables for theming:

- `--color-primary` - Primary brand color
- `--color-success` - Success state color
- `--color-warning` - Warning state color
- `--color-error` - Error state color
- `--color-bg` - Background color
- `--color-bg-secondary` - Secondary background
- `--color-text` - Primary text color
- `--color-text-secondary` - Secondary text color
- `--color-border` - Border color

Components automatically adapt to light/dark mode.
