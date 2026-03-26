# Code Quality & Push Workflow

## Local CI Pipeline

Run these in order before pushing — they mirror CI:

```bash
cd packages/sdk && npm run build && cd ../connect && npm run build && cd ../..
npx tsc --noEmit --skipLibCheck    # zero errors
npm run lint                        # zero biome warnings
npm run build:server && npm run build:ui
npm test -- --run                   # all tests pass
```

> `packages/shared` has no build step — it's consumed directly as TypeScript source by the server and other packages.

## Biome Lint

Auto-fix safe issues: `npx biome lint src-server/ src-ui/ packages/ --write --unsafe`

Common gotchas:
- `noUnusedImports` — SDK uses `react-jsx` transform, so `import React` is NOT needed. If you see `'React' refers to a UMD global`, the tsconfig is wrong, not the import.
- `useExhaustiveDependencies` — verify deps are correct before accepting auto-fix.
- `noUnusedVariables` / `noUnusedFunctionParameters` — prefix with `_` if intentionally unused.

## Route Typing

All Hono route handlers use helpers from `src-server/routes/schemas.ts`:
- `getBody(c)` instead of `c.get('body')` — avoids Hono's `unknown` return type
- `param(c, 'name')` instead of `c.req.param('name')` — returns `string` (throws 400 if missing)

Always import from schemas. Never use raw `c.get('body')` or `c.req.param()`.

## Clean Core

The core must remain vendor-neutral and free of organization-specific references. No hardcoded company domains, internal tool names, employee identifiers, or proprietary service URLs should appear in source code, configs, or comments. Before pushing, scan the diff for anything that couples the core to a specific organization and remove it. Default implementations should work for any user out of the box.

## Push & Monitor

Push to all configured remotes (`git remote -v` to list). After pushing, use `gh` (if available) to monitor CI pipeline status until all workflows pass.
