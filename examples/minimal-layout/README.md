# Minimal Layout Plugin

A minimal layout plugin example for Stallion, demonstrating the plugin architecture and SDK usage.

## Features

- Lists available agents
- Opens chat dock
- Shows toast notifications
- Uses theme CSS variables for styling

## Installation

### Using the CLI

```bash
stallion plugin install ./examples/minimal-layout
```

### Using the UI

Go to **Settings → Plugins**, enter the path `./examples/minimal-layout`, and click Install.

## Development

### Setup

```bash
cd examples/minimal-layout
npm install
```

### Build

```bash
npm run build
```

### Watch mode

```bash
npm run dev
```

### Test in Stallion

```bash
# Remove and reinstall during development
stallion plugin remove minimal-layout
stallion plugin install ./examples/minimal-layout
npm run dev:ui
```

## Usage

1. Install the plugin in your Stallion instance
2. Create a workspace configuration that references this component:

```json
{
  "name": "My Workspace",
  "slug": "my-workspace",
  "tabs": [
    {
      "id": "main",
      "label": "Main",
      "component": "minimal-layout"
    }
  ]
}
```

3. Navigate to the workspace in the UI

## SDK Usage

This plugin demonstrates:

### Accessing Agents

```typescript
import { useAgents } from '@stallion-ai/sdk';

const agents = useAgents();
```

### Controlling Navigation

```typescript
import { useNavigation } from '@stallion-ai/sdk';

const { setDockState } = useNavigation();
setDockState(true); // Open chat dock
```

### Showing Notifications

```typescript
import { useToast } from '@stallion-ai/sdk';

const { showToast } = useToast();
showToast({
  type: 'info',
  message: 'Hello from plugin!',
});
```

## File Structure

```
minimal-layout/
├── src/
│   └── index.tsx           # Main component
├── dist/                   # Built output (gitignored)
├── scripts/
│   └── install-plugin.js   # Postinstall script
├── plugin.json             # Plugin manifest
├── package.json
├── tsconfig.json
└── README.md
```

## Plugin Manifest

```json
{
  "name": "minimal-layout",
  "version": "1.0.0",
  "type": "layout",
  "displayName": "Minimal Layout",
  "description": "A minimal layout plugin example",
  "entrypoint": "./index.tsx",
  "capabilities": ["chat", "navigation"],
  "permissions": ["navigation.dock"]
}
```

## Styling

Use CSS variables from the core app theme:

```typescript
<button style={{
  background: 'var(--bg-accent)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-primary)',
}}>
  Click me
</button>
```

Available variables:
- `--bg-primary`, `--bg-secondary`, `--bg-accent`
- `--text-primary`, `--text-secondary`, `--text-muted`
- `--border-primary`, `--border-secondary`

## TypeScript

The plugin is fully typed using types from `@stallion-ai/sdk`:

```typescript
import type { WorkspaceComponentProps } from '@stallion-ai/sdk';

export default function MyWorkspace(props: WorkspaceComponentProps) {
  // ...
}
```

## License

MIT
