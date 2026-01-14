# Plugin Architecture

## Overview

Work Agent uses an NPM-based plugin system that allows workspaces and plugins to be installed separately from the core application. This enables:

- Clean separation between core app and custom workspaces
- Version management via npm
- Easy distribution and updates
- Peer dependency enforcement for SDK compatibility

## Directory Structure

```
work-agent/                          # Core repository
├── src-ui/src/
│   ├── workspaces/                  # Gitignored - plugins install here
│   │   └── .gitkeep
│   ├── plugins/                     # Gitignored - plugins install here
│   │   └── .gitkeep
│   └── core/
│       └── PluginRegistry.tsx       # Auto-discovers installed plugins
└── packages/
    └── sdk/                         # @stallion-ai/sdk

work-agent-plugins/                  # Separate repository
├── packages/
│   ├── sa-dashboard/
│   │   ├── src/
│   │   │   └── index.tsx
│   │   ├── plugin.json
│   │   ├── package.json
│   │   └── README.md
│   └── sfdc-account-manager/
└── examples/
    └── minimal-workspace/
```

## Plugin Types

### 1. Workspace Plugins
Full-page workspace components that render in the main canvas area.

**Example:** `sa-dashboard`, `project-stallion-dashboard`

### 2. Component Plugins
Reusable UI components that can be embedded in workspaces or other views.

**Example:** `sfdc-account-manager`, `calendar-widget`

## Installation Methods

### Method 1: NPM Package (Recommended)

```bash
# Install from npm registry
npm install @work-agent/sa-dashboard

# Install from git
npm install github:work-agent/plugins#sa-dashboard

# Install from local path (development)
npm install ../work-agent-plugins/packages/sa-dashboard
```

### Method 2: Postinstall Script

Plugins can use postinstall scripts to copy files to the correct location:

```json
{
  "scripts": {
    "postinstall": "node scripts/install-plugin.js"
  }
}
```

```javascript
// scripts/install-plugin.js
const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, '../../../src-ui/src/workspaces/sa-dashboard');
const sourceDir = path.join(__dirname, '../dist');

fs.cpSync(sourceDir, targetDir, { recursive: true });
console.log('✓ Installed sa-dashboard workspace');
```

### Method 3: Symlink (Development)

```bash
# Create symlink for development
ln -s $(pwd)/work-agent-plugins/packages/sa-dashboard/dist \
      work-agent/src-ui/src/workspaces/sa-dashboard
```

## Plugin Manifest (plugin.json)

```json
{
  "name": "sa-dashboard",
  "version": "1.0.0",
  "type": "workspace",
  "sdkVersion": "^0.4.0",
  "displayName": "SA Dashboard",
  "description": "Stallion AI workspace dashboard",
  "entrypoint": "./index.tsx",
  "capabilities": ["chat", "navigation", "storage"],
  "permissions": ["storage.session", "navigation.dock"],
  "dependencies": {
    "@stallion-ai/sdk": "^0.4.0",
    "react": "^19.0.0"
  },
  "peerDependencies": {
    "@stallion-ai/sdk": "^0.4.0"
  }
}
```

### Manifest Fields

- **name**: Unique plugin identifier (kebab-case)
- **version**: Semantic version
- **type**: `workspace` | `component` | `tool`
- **sdkVersion**: Compatible SDK version range
- **displayName**: Human-readable name
- **description**: Brief description
- **entrypoint**: Main export file (relative to package root)
- **capabilities**: Features the plugin uses
- **permissions**: Required permissions
- **dependencies**: Runtime dependencies
- **peerDependencies**: SDK and React versions

## Plugin Package Structure

```
@work-agent/sa-dashboard/
├── src/
│   ├── index.tsx                    # Main component export
│   ├── components/
│   │   ├── Calendar.tsx
│   │   └── TaskList.tsx
│   └── hooks/
│       └── useCalendarData.ts
├── dist/                            # Built output
│   ├── index.js
│   └── index.d.ts
├── plugin.json                      # Plugin manifest
├── package.json
├── tsconfig.json
└── README.md
```

### package.json

```json
{
  "name": "@work-agent/sa-dashboard",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "plugin.json"],
  "scripts": {
    "build": "tsc",
    "postinstall": "node scripts/install-plugin.js"
  },
  "peerDependencies": {
    "@stallion-ai/sdk": "^0.4.0",
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@stallion-ai/sdk": "^0.4.0",
    "@types/react": "^19.0.0",
    "typescript": "^5.0.0"
  }
}
```

## Plugin Registry (Auto-Discovery)

The core app automatically discovers installed plugins:

```typescript
// src-ui/src/core/PluginRegistry.tsx
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

interface PluginManifest {
  name: string;
  type: 'workspace' | 'component';
  displayName: string;
  entrypoint: string;
}

export class PluginRegistry {
  private workspaces = new Map<string, any>();
  private components = new Map<string, any>();

  async discover() {
    const workspacesDir = './src-ui/src/workspaces';
    const pluginsDir = './src-ui/src/plugins';

    await this.scanDirectory(workspacesDir, 'workspace');
    await this.scanDirectory(pluginsDir, 'component');
  }

  private async scanDirectory(dir: string, type: string) {
    if (!existsSync(dir)) return;

    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.gitkeep') continue;

      const manifestPath = join(dir, entry.name, 'plugin.json');
      if (!existsSync(manifestPath)) continue;

      const manifest: PluginManifest = require(manifestPath);
      const module = await import(join(dir, entry.name, manifest.entrypoint));

      if (type === 'workspace') {
        this.workspaces.set(manifest.name, module.default);
      } else {
        this.components.set(manifest.name, module.default);
      }
    }
  }

  getWorkspace(name: string) {
    return this.workspaces.get(name);
  }

  getComponent(name: string) {
    return this.components.get(name);
  }

  listWorkspaces() {
    return Array.from(this.workspaces.keys());
  }
}
```

## Plugin Development Workflow

### 1. Create Plugin Package

```bash
cd work-agent-plugins/packages
mkdir my-workspace
cd my-workspace
npm init -y
```

### 2. Add Dependencies

```json
{
  "peerDependencies": {
    "@stallion-ai/sdk": "^0.4.0",
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@stallion-ai/sdk": "^0.4.0",
    "@types/react": "^19.0.0",
    "typescript": "^5.0.0"
  }
}
```

### 3. Create Plugin Manifest

```json
{
  "name": "my-workspace",
  "version": "1.0.0",
  "type": "workspace",
  "sdkVersion": "^0.4.0",
  "displayName": "My Workspace",
  "entrypoint": "./index.tsx"
}
```

### 4. Implement Component

```typescript
// src/index.tsx
import { useAgents, useNavigation, useToast } from '@stallion-ai/sdk';

export default function MyWorkspace() {
  const { agents } = useAgents();
  const { setDockState } = useNavigation();
  const { showToast } = useToast();

  return (
    <div>
      <h1>My Workspace</h1>
      <button onClick={() => setDockState(true)}>Open Chat</button>
    </div>
  );
}
```

### 5. Build and Test

```bash
# Build plugin
npm run build

# Link for development
cd ../../../work-agent
npm link ../work-agent-plugins/packages/my-workspace

# Or install directly
npm install ../work-agent-plugins/packages/my-workspace
```

### 6. Publish

```bash
# Publish to npm
npm publish --access public

# Or push to git
git tag v1.0.0
git push origin v1.0.0
```

## SDK Integration

Plugins access core functionality via `@stallion-ai/sdk`:

```typescript
import {
  // Contexts
  useAgents,
  useWorkspaces,
  useConversations,
  useModels,
  useApiBase,
  
  // Chat operations
  useCreateChatSession,
  useSendMessage,
  useActiveChatActions,
  
  // Navigation
  useNavigation,
  useToast,
  
  // Slash commands
  useSlashCommandHandler,
  useSlashCommands,
  
  // Tool approval
  useToolApproval,
  
  // Types
  AgentSummary,
  WorkspaceConfig,
  Message,
} from '@stallion-ai/sdk';
```

## Versioning Strategy

### SDK Versioning

- **Major**: Breaking API changes
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes

### Plugin Compatibility

Plugins declare SDK compatibility via `peerDependencies`:

```json
{
  "peerDependencies": {
    "@stallion-ai/sdk": "^0.4.0"
  }
}
```

The core app validates compatibility at runtime and warns about mismatches.

## Security Considerations

### Permission System

Plugins declare required permissions in `plugin.json`:

```json
{
  "permissions": [
    "storage.session",      // Access session storage
    "navigation.dock",      // Control chat dock
    "agent.invoke",         // Invoke agent actions
    "filesystem.read"       // Read local files
  ]
}
```

The core app enforces permissions at runtime.

### Sandboxing

Future enhancement: Run plugins in isolated contexts with limited API access.

## Migration Path

### Existing Workspaces

1. Move workspace to separate package
2. Add `plugin.json` manifest
3. Update imports to use `@stallion-ai/sdk`
4. Build and publish
5. Install in core app via npm

### Example Migration

**Before:**
```typescript
// src-ui/src/workspaces/SADashboard.tsx
import { useAgents } from '../contexts/AgentsContext';
```

**After:**
```typescript
// packages/sa-dashboard/src/index.tsx
import { useAgents } from '@stallion-ai/sdk';
```

## Best Practices

1. **Use peer dependencies** for SDK and React to avoid version conflicts
2. **Declare all permissions** explicitly in plugin.json
3. **Version carefully** - follow semver strictly
4. **Test compatibility** with multiple SDK versions
5. **Document dependencies** clearly in README
6. **Provide examples** in plugin documentation
7. **Handle errors gracefully** - don't crash the host app
8. **Optimize bundle size** - tree-shake unused SDK features

## Troubleshooting

### Plugin Not Discovered

- Check `plugin.json` exists and is valid JSON
- Verify `entrypoint` path is correct
- Ensure plugin is installed in correct directory
- Check console for discovery errors

### SDK Version Mismatch

```
Warning: Plugin 'sa-dashboard' requires SDK ^0.4.0 but ^0.3.0 is installed
```

Solution: Update SDK or plugin to compatible version

### Missing Permissions

```
Error: Plugin 'my-workspace' requires permission 'navigation.dock'
```

Solution: Add permission to `plugin.json` manifest

## Future Enhancements

- [ ] Plugin marketplace/registry
- [ ] Hot reload during development
- [ ] Plugin sandboxing and isolation
- [ ] Automated compatibility testing
- [ ] Plugin analytics and telemetry
- [ ] Visual plugin builder/scaffolding tool
