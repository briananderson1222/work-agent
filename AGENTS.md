# Agent Notes

## Stallion CLI

Always use `./stallion` to manage the app — never raw npm scripts.

```bash
./stallion --help              # Discover all commands and flags
./stallion start               # Start (auto-builds if needed)
./stallion start --clean --force  # Wipe and rebuild from scratch
./stallion stop                # Stop running processes
```

### Port rules

Default ports (3141 server, 3000 UI) are **reserved for user testing**. Agents must always use unique ports:

```bash
./stallion start --clean --force --port=3242 --ui-port=5274
```

Pick ports that won't collide with other agents running concurrently.

### Playwright tests

The `playwright.config.ts` reads `PW_BASE_URL` from the environment. Run tests against your unique UI port:

```bash
PW_BASE_URL=http://localhost:<ui-port> npx playwright test tests/<feature>.spec.ts
```

Tests live in `tests/` and follow these conventions:
- `import { test, expect } from '@playwright/test'`
- Role-based selectors (`getByRole`, `getByText`, `getByPlaceholder`) over CSS
- Seed state via `page.addInitScript` or `page.evaluate`
- Route API calls with `page.route` to isolate from backend state

### Code style

- Prefer CSS classes over inline styles. The project uses `.css` files alongside components.

### Known issues

- The ChatDock overlay intercepts pointer events on sidebar buttons near the bottom of the viewport. Use `element.dispatchEvent('click')` in Playwright tests to bypass.
