# Theming & Branding

Stallion supports dark and light themes via CSS custom properties, and runtime branding customisation via a server-side provider API.

## Theme System

Themes are implemented as CSS custom property sets on the `<html>` element using the `data-theme` attribute. The default theme is `dark`.

### Switching Themes

The `ThemeToggle` component (`src-ui/src/components/ThemeToggle.tsx`) persists the user's choice to `localStorage` and applies it:

```ts
document.documentElement.setAttribute('data-theme', theme); // 'dark' | 'light'
localStorage.setItem('theme', theme);
```

The keyboard shortcut `Cmd+H` toggles between dark and light.

### CSS Custom Properties

All variables are defined in `src-ui/src/index.css`. Dark is the default (`:root` and `[data-theme="dark"]`); light overrides are under `[data-theme="light"]`.

#### Layout

| Variable | Description |
|---|---|
| `--chat-dock-header-height` | Chat dock header height (`55px`) |
| `--app-toolbar-height` | App toolbar height (`46px`) |

#### Backgrounds

| Variable | Dark | Light |
|---|---|---|
| `--bg-primary` | `#1a1a1a` | `#ffffff` |
| `--bg-secondary` | `#242424` | `#f5f5f5` |
| `--bg-tertiary` | `#2a2a2a` | `#eeeeee` |
| `--bg-elevated` | `#333` | `#e0e0e0` |
| `--bg-input` | `#1a1a1a` | `#ffffff` |
| `--bg-hover` | `#1f1f1f` | `#e8e8e8` |
| `--bg-active` | `#252525` | `#d8d8d8` |
| `--bg-selected` | `#2f2f2f` | `#d0d0d0` |
| `--bg-highlight` | `#3a3a3a` | `#c5c5c5` |
| `--bg-modal` | `#2c2c2c` | `#ffffff` |

#### Text

| Variable | Dark | Light |
|---|---|---|
| `--text-primary` | `#e0e0e0` | `#1a1a1a` |
| `--text-secondary` | `#d0d0d0` | `#333333` |
| `--text-tertiary` | `#9c9c9c` | `#666666` |
| `--text-muted` | `#999` | `#757575` |
| `--text-disabled` | `#777` | `#999999` |
| `--text-inverted` | `#0b101a` | `#ffffff` |
| `--text-muted-light` | `#b0b0b0` | `#757575` |
| `--text-muted-lighter` | `#ccc` | `#9e9e9e` |
| `--text-subtle` | `#555` | `#bdbdbd` |

#### Borders

| Variable | Dark | Light |
|---|---|---|
| `--border-primary` | `#333` | `#e0e0e0` |
| `--border-secondary` | `#444` | `#cccccc` |
| `--border-light` | `#7b7b7b` | `#b0b0b0` |
| `--border-dashed` | `#333` | `#e0e0e0` |

#### Accent / Brand

| Variable | Dark | Light |
|---|---|---|
| `--accent-primary` | `#4a9eff` | `#0052a3` |
| `--accent-hover` | `rgba(74,158,255,0.1)` | `rgba(0,102,204,0.1)` |
| `--accent-darker` | `#3a8eef` | `#0052a3` |
| `--accent-yellow` | `#c9a854` | `#ca8a04` |
| `--accent-acp` | `#f59e0b` | — |
| `--accent-light` | `rgba(74,158,255,0.25)` | `rgba(0,82,163,0.2)` |
| `--accent-medium` | `rgba(74,158,255,0.15)` | `rgba(0,82,163,0.12)` |
| `--accent-strong` | `rgba(74,158,255,0.3)` | `rgba(0,82,163,0.2)` |
| `--accent-subtle` | `rgba(74,158,255,0.05)` | `rgba(0,82,163,0.05)` |
| `--accent-border` | `rgba(74,158,255,0.3)` | `rgba(0,82,163,0.3)` |

#### Semantic Colors

| Variable | Dark | Light |
|---|---|---|
| `--error-bg` | `#402323` | `#fff5f5` |
| `--error-border` | `#5a2e2e` | `#ffcccc` |
| `--error-text` | `#ff6b6b` | `#d32f2f` |
| `--error-dark` | `#b71c1c` | `#c62828` |
| `--success-bg` | `#234023` | `#f5fff5` |
| `--success-border` | `#2e5a2e` | `#ccffcc` |
| `--success-text` | `#b7f0b7` | `#2e7d32` |
| `--warning-bg` | `#403823` | `#fffbf0` |
| `--warning-border` | `#5a4e2e` | `#ffe0b2` |
| `--warning-text` | `#f59e0b` | `#d97706` |
| `--warning-primary` | `#ffb74d` | `#f57c00` |
| `--health-success` | `#10b981` | `#059669` |
| `--health-error` | `#ef4444` | `#dc2626` |
| `--health-warning` | `#f59e0b` | `#d97706` |

#### Event Colors

Used for the monitoring event stream timeline.

| Variable | Dark | Light |
|---|---|---|
| `--event-agent-start` | `#3b82f6` | `#2563eb` |
| `--event-agent-complete` | `#8b5cf6` | `#7c3aed` |
| `--event-tool-call` | `#f59e0b` | `#d97706` |
| `--event-tool-result` | `#10b981` | `#059669` |
| `--event-agent-health` | `#06b6d4` | `#0891b2` |
| `--event-planning` | `#8b5cf6` | `#7c3aed` |
| `--event-reasoning` | `#ec4899` | `#db2777` |

#### Overlays & Shadows

| Variable | Dark | Light |
|---|---|---|
| `--overlay-bg` | `rgba(0,0,0,0.2)` | `rgba(0,0,0,0.05)` |
| `--overlay-bg-dark` | `rgba(0,0,0,0.3)` | `rgba(0,0,0,0.1)` |
| `--overlay-bg-darker` | `rgba(0,0,0,0.4)` | `rgba(0,0,0,0.15)` |
| `--overlay-modal` | `rgba(0,0,0,0.7)` | `rgba(0,0,0,0.5)` |
| `--shadow-sm` | `0 -2px 10px rgba(0,0,0,0.2)` | `0 -2px 10px rgba(0,0,0,0.1)` |
| `--shadow-md` | `0 -4px 20px rgba(0,0,0,0.3)` | `0 -4px 20px rgba(0,0,0,0.15)` |
| `--shadow-lg` | `0 16px 40px rgba(0,0,0,0.5)` | `0 16px 40px rgba(0,0,0,0.2)` |
| `--shadow-xl` | `0 18px 40px rgba(0,0,0,0.25)` | `0 18px 40px rgba(0,0,0,0.12)` |
| `--shadow-modal` | `0 24px 60px rgba(0,0,0,0.5)` | `0 24px 60px rgba(0,0,0,0.3)` |

#### Semantic Aliases

These alias the above variables and are the preferred tokens to use in component CSS:

| Variable | Maps to |
|---|---|
| `--color-bg` | `--bg-primary` |
| `--color-bg-secondary` | `--bg-secondary` |
| `--color-text` | `--text-primary` |
| `--color-text-secondary` | `--text-secondary` |
| `--color-border` | `--border-primary` |
| `--color-primary` | `--accent-primary` |
| `--color-accent` | `--accent-yellow` |
| `--color-error` | `--error-text` |

#### Typography

The app uses two font families loaded from Google Fonts:

| Font | Usage |
|---|---|
| `DM Sans` (400, 500, 600, 700) | Body, UI elements (`font-family: 'DM Sans', system-ui, sans-serif`) |
| `JetBrains Mono` (400, 500, 600) | Code blocks, monospace elements |

## Creating a Custom Theme

To add a new theme variant, add a `[data-theme="my-theme"]` block to `src-ui/src/index.css` overriding the variables you want to change:

```css
[data-theme="my-theme"] {
  --bg-primary: #0d1117;
  --accent-primary: #58a6ff;
  /* override only what differs from dark */
}
```

Then set the attribute programmatically:

```ts
document.documentElement.setAttribute('data-theme', 'my-theme');
```

## Branding API

The server exposes a branding endpoint that the UI fetches on startup:

```
GET /api/branding
```

Response:

```json
{
  "name": "Stallion",
  "logo": { "src": "https://...", "alt": "Logo" },
  "theme": { "--accent-primary": "#ff6600" },
  "welcomeMessage": "Welcome to Acme AI"
}
```

The `theme` field is a `Record<string, string>` of CSS variable overrides. The UI (`src-ui/src/hooks/useBranding.ts`) fetches this and exposes it via the `useBranding()` hook. Components can apply the theme object to the document root:

```ts
const { theme } = useBranding();
if (theme) {
  Object.entries(theme).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
}
```

### Implementing a Custom Branding Provider

Implement `IBrandingProvider` from `src-server/providers/provider-interfaces.ts` and register it:

```ts
// Internal server imports — not a published npm package
import type { IBrandingProvider } from '../providers/provider-interfaces.js';
import { registerBrandingProvider } from '../providers/registry.js';

class MyBranding implements IBrandingProvider {
  async getAppName() { return 'Acme AI'; }
  async getLogo() { return { src: 'https://acme.com/logo.png', alt: 'Acme' }; }
  async getTheme() {
    return { '--accent-primary': '#ff6600', '--accent-darker': '#cc5200' };
  }
  async getWelcomeMessage() { return 'Welcome to Acme AI'; }
}

registerBrandingProvider(new MyBranding());
```

The provider is registered in the plugin or runtime entry point. The `getLogo`, `getTheme`, and `getWelcomeMessage` methods are all optional — omit any you don't need.

> **Note:** For plugins, branding providers are loaded from the `providers/` directory in your plugin and registered automatically by the server when `"type": "branding"` is declared in `plugin.json`. You don't need to call `registerBrandingProvider` directly — just export the factory function from your module.
