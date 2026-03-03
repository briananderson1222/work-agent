# Custom Branding Example

Shows how a plugin can override Work Agent's default branding using the provider system.

## What it does

Registers a `branding` provider that replaces:
- **App name**: "Work Agent" → "Project Stallion"
- **Logo**: adds a custom logo with alt text
- **Welcome message**: custom onboarding text

## Install

```bash
cp -r examples/custom-branding .stallion-ai/plugins/custom-branding
```

Then restart the server or hit `POST /api/plugins/reload`.

## Verify

```bash
curl http://localhost:4310/api/branding
# → {"name":"Project Stallion","logo":{"src":"/favicon.png","alt":"Stallion"},"theme":null,"welcomeMessage":"Welcome to Project Stallion — your AI-powered workspace"}
```

The header, onboarding gate, and workspace view will all reflect the new branding.

## Disable without uninstalling

In the UI: **Plugins → custom-branding → Providers → toggle branding off**

Or via API:
```bash
curl -X PUT http://localhost:4310/api/plugins/custom-branding/overrides \
  -H 'Content-Type: application/json' \
  -d '{"disabled":["branding"]}'
```

## Structure

```
custom-branding/
├── plugin.json              ← declares the branding provider
├── providers/
│   └── branding.js          ← IBrandingProvider implementation
└── README.md
```

The provider module exports a factory function that returns an object implementing `IBrandingProvider`. No build step needed — it's plain CommonJS.
