# Build Your First Plugin

This guide walks through the fastest path from zero to a working Stallion plugin using the `stallion plugin create` scaffolds.

## Choose a Template

Use the template that matches the job:

```bash
./stallion plugin create hello-layout --template=layout
./stallion plugin create provider-kit --template=provider
./stallion plugin create full-workspace --template=full
```

- `layout` creates a UI-focused plugin with a layout manifest and entrypoint.
- `provider` creates a server-side plugin with `plugin.mjs`, a `serverModule`, and a sample provider file.
- `full` creates the combined starter: layout, agent, build config, and README.

`./stallion plugin init` still works, but it is now just a compatibility alias for the `full` template.

## Start With a Layout Plugin

```bash
./stallion plugin create hello-layout --template=layout
cd hello-layout
./stallion plugin dev 4300
```

Open `http://localhost:4300` and keep the dev server running. The dev server:

- builds the plugin in dev mode
- watches `src/` and config files for reloads
- regenerates the preview shell when layout or manifest files change
- exposes the same fetch/tool proxy surface the host uses

Edit `src/index.tsx` and `layout.json`, then confirm the preview reloads cleanly.

## Install It Into Stallion

From the plugin directory:

```bash
./stallion plugin install .
```

If you want to test the registry path too, point Stallion at the bundled local manifest:

```bash
./stallion registry ./examples/registry/manifest.json
./stallion registry install demo-layout
```

That manifest ships with three curated examples:

- `minimal-layout`
- `demo-layout`
- `enterprise-layout`

## Add Server Logic

Provider-style plugins can expose request-scoped server routes through `serverModule`:

```json
{
  "name": "provider-kit",
  "version": "1.0.0",
  "displayName": "Provider Kit",
  "serverModule": "./plugin.mjs",
  "providers": [
    { "type": "branding", "module": "./providers/branding.js" }
  ]
}
```

Your `plugin.mjs` can register routes plus request lifecycle hooks:

```js
export const hooks = {
  onRequest({ correlationId, path }) {
    console.log('request', correlationId, path);
  },
  onResponse({ correlationId, status }) {
    console.log('response', correlationId, status);
  },
};

export function register(app, context) {
  app.get('/ping', (c) =>
    c.json({
      ok: true,
      plugin: context.pluginName,
      correlationId: c.req.header('x-stallion-correlation-id') || null,
    }),
  );
}
```

Routes are mounted under `/api/plugins/<plugin-name>/...`. The registration context gives you `pluginName`, `projectHomeDir`, `logger`, and config helpers; request correlation IDs are available in request hooks and on the `x-stallion-correlation-id` header.

## What To Copy Next

- Use [plugins.md](./plugins.md) for the full manifest reference.
- Use [examples/demo-layout](../../examples/demo-layout/README.md) for a starter workspace example.
- Use [examples/enterprise-layout](../../examples/enterprise-layout/README.md) when you need a larger multi-panel plugin to copy from.
