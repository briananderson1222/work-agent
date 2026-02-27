# Plugin Development

## Structure

```
my-plugin/
├── plugin.json          # Manifest (required)
├── package.json         # Node package with esbuild devDep
├── build.mjs            # Build script
├── workspace.json       # Workspace config (tabs, prompts)
├── src/
│   └── index.tsx        # Entry point — exports `components` map
├── agents/              # Agent configs (optional)
│   └── my-agent/
│       └── agent.json
└── providers/           # Server-side providers (optional)
    └── my-provider.js
```

## plugin.json

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "type": "workspace",
  "sdkVersion": "^0.4.0",
  "displayName": "My Plugin",
  "description": "What this plugin does",
  "entrypoint": "src/index.tsx",
  "capabilities": ["chat", "navigation"],
  "permissions": ["navigation.dock"],
  "agents": [
    { "slug": "my-agent", "source": "./agents/my-agent/agent.json" }
  ],
  "workspace": {
    "slug": "my-workspace",
    "source": "./workspace.json"
  },
  "providers": [
    { "type": "auth", "module": "./providers/my-auth.js" }
  ]
}
```

## workspace.json

```json
{
  "name": "My Workspace",
  "slug": "my-workspace",
  "tabs": [
    { "id": "dashboard", "label": "Dashboard", "component": "my-plugin-dashboard" },
    { "id": "settings", "label": "Settings", "component": "my-plugin-settings" }
  ]
}
```

Tab `component` values must match keys in the `components` export from `src/index.tsx`.

## Entry Point (src/index.tsx)

```tsx
import { useSendToChat, useAuth } from '@work-agent/sdk';

function Dashboard({ workspace, activeTab, onShowChat }) {
  const sendToChat = useSendToChat('my-agent');
  // ...
}

function Settings(props) { /* ... */ }

export const components = {
  'my-plugin-dashboard': Dashboard,
  'my-plugin-settings': Settings,
};

export default Dashboard;
```

- Export a `components` map — keys match workspace.json tab `component` fields
- Components receive `{ workspace, activeTab, onShowChat, onLaunchPrompt }`
- Use any hook from `@work-agent/sdk`
- Use `@tanstack/react-query` hooks — they share the host's QueryClient

## Build System

Plugins are built on install/update by the server. No `dist/` in git.

The server runs: `npm install --omit=dev && node build.mjs` (or `bash build.sh`).

### package.json

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "build": "node build.mjs" },
  "devDependencies": {
    "esbuild": "^0.25.0",
    "react": "^19.0.0"
  },
  "peerDependencies": {
    "@work-agent/sdk": "^0.3.0",
    "react": "^18.0.0 || ^19.0.0"
  }
}
```

### build.mjs

```js
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/bundle.js',
  jsx: 'automatic',
  external: [],
  banner: {
    js: `
const __shared = window.__work_agent_shared || {};
const __require = (m) => {
  if (m === 'react' || m === 'react/jsx-runtime') return __shared['react'];
  if (m === '@work-agent/sdk') return __shared['@work-agent/sdk'];
  if (m === '@tanstack/react-query') return __shared['@tanstack/react-query'];
  throw new Error('Plugin requires unknown module: ' + m);
};
`,
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    name: 'externalize-shared',
    setup(build) {
      build.onResolve({
        filter: /^react$|^react\/|^@work-agent\/sdk$|^@tanstack\/react-query$/
      }, args => ({ path: args.path, namespace: 'shared-external' }));
      build.onLoad({ filter: /.*/, namespace: 'shared-external' }, args => ({
        contents: `module.exports = __require('${args.path.startsWith('react') ? 'react' : args.path}')`,
        loader: 'js',
      }));
    },
  }],
  logLevel: 'info',
});
```

Output: `dist/bundle.js` (and optionally `dist/bundle.css` for styles).

## Shared Modules

These are provided by the host via `window.__work_agent_shared` and must be **externalized** (not bundled):

| Module | What |
|--------|------|
| `react`, `react/jsx-runtime` | React runtime |
| `@work-agent/sdk` | SDK hooks, navigation, auth, providers |
| `@tanstack/react-query` | Data fetching — shares host's QueryClient |
| `dompurify` | HTML sanitization |
| `debug` | Debug logging |
| `zod` | Schema validation |

Add any you use to the `__require` shim and the `onResolve` filter in `build.mjs`.

## Install & Update

```bash
# Install from git
curl -X POST http://localhost:3141/api/plugins/install \
  -H 'Content-Type: application/json' \
  -d '{"source": "git@gitlab:team/my-plugin.git"}'

# Install from local path
curl -X POST http://localhost:3141/api/plugins/install \
  -H 'Content-Type: application/json' \
  -d '{"source": "/path/to/my-plugin"}'

# Update (git pull + rebuild)
curl -X POST http://localhost:3141/api/plugins/my-plugin/update

# Remove
curl -X DELETE http://localhost:3141/api/plugins/my-plugin
```

## Example

See `examples/demo-workspace/` for a minimal working plugin.
