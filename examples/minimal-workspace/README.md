# Minimal Workspace Plugin

A minimal workspace plugin example for Work Agent, demonstrating the plugin architecture and SDK usage.

## Features

- Lists available agents
- Opens chat dock
- Shows toast notifications
- Uses theme CSS variables for styling

## Installation

### From npm (when published)

```bash
cd work-agent
npm install @work-agent/minimal-workspace
```

### From local directory (development)

```bash
cd work-agent
npm install ../examples/minimal-workspace
```

### Manual installation

```bash
# Build the plugin
cd examples/minimal-workspace
npm install
npm run build

# Copy to core app
cp -r dist ../work-agent/src-ui/src/workspaces/minimal-workspace
cp plugin.json ../work-agent/src-ui/src/workspaces/minimal-workspace/
```

## Development

### Setup

```bash
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

### Test in core app

```bash
# Link for development
cd work-agent
npm link ../examples/minimal-workspace

# Or use symlink
ln -s $(pwd)/examples/minimal-workspace/dist \
      work-agent/src-ui/src/workspaces/minimal-workspace
```

## Usage

1. Install the plugin in your Work Agent instance
2. Create a workspace configuration that references this component:

```json
{
  "name": "My Workspace",
  "slug": "my-workspace",
  "tabs": [
    {
      "id": "main",
      "label": "Main",
      "component": "minimal-workspace"
    }
  ]
}
```

3. Navigate to the workspace in the UI

## SDK Usage

This plugin demonstrates:

### Accessing Agents

```typescript
import { useAgents } from '@work-agent/sdk';

const agents = useAgents();
```

### Controlling Navigation

```typescript
import { useNavigation } from '@work-agent/sdk';

const { setDockState } = useNavigation();
setDockState(true); // Open chat dock
```

### Showing Notifications

```typescript
import { useToast } from '@work-agent/sdk';

const { showToast } = useToast();
showToast({
  type: 'info',
  message: 'Hello from plugin!',
});
```

## File Structure

```
minimal-workspace/
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
  "name": "minimal-workspace",
  "version": "1.0.0",
  "type": "workspace",
  "sdkVersion": "^0.4.0",
  "displayName": "Minimal Workspace",
  "description": "A minimal workspace plugin example",
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

The plugin is fully typed using types from `@work-agent/sdk`:

```typescript
import type { WorkspaceComponentProps } from '@work-agent/sdk';

export default function MyWorkspace(props: WorkspaceComponentProps) {
  // ...
}
```

## License

MIT
