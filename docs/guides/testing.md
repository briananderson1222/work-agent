# Testing Guide

## Philosophy

- **Unit tests** for business logic (services, utilities, pure functions)
- **Integration tests** for HTTP routes (Hono `app.request()`)
- **E2E tests** for user journeys (Playwright)

## Conventions

| Type | Framework | Pattern | Location |
|---|---|---|---|
| Unit / Integration | Vitest | `*.test.ts` | `__tests__/` colocated with source |
| E2E | Playwright | `*.spec.ts` | `tests/` at project root |
| Test utilities | — | named exports | `__test-utils__/` colocated with source |

## Running Tests

```bash
npm run verify                    # default local gate: lint, typecheck, unit, product e2e, live smoke e2e
npm test                          # vitest watch mode
npx vitest run                    # single run
npm run test:coverage             # with coverage report
npm run install:playwright        # install repo-local Chromium once
npm run test:e2e:product          # promoted product Playwright suite via ./stallion temp-home instance
npm run test:e2e:smoke-live       # live app smoke via ./stallion temp-home instance
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test               # e2e
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test tests/foo.spec.ts  # single e2e
npm run test:connected-agents         # focused connected-agents server suite
```

`test:e2e:product` and `test:e2e:smoke-live` allocate non-default ports,
start a temporary `./stallion` instance, set `PW_BASE_URL`/`STALLION_PORT`, run
Playwright with repo-local browsers, and stop the instance in cleanup. Use these
scripts for verification claims instead of ad hoc default-port runs.

## Durable Verification Lanes

For roadmap work that changes product behavior, prefer adding or extending a named verification lane rather than relying on ad hoc manual checks.

Recommended lane types:

1. **Hermetic startup smoke**
   - prefer `./stallion start --temp-home` (or a temporary `STALLION_AI_DIR` when you need an explicit path)
   - scrub env vars in the child process instead of changing the developer's shell
   - prove first-run behavior without depending on the current machine state

2. **Adapter registration integration**
   - prove runtime/provider adapters register through the shared registry path
   - prefer temp fixtures or temp plugins

3. **Onboarding e2e**
   - prove setup launcher, doctor guidance, and reaching a chat-capable path

4. **Cross-runtime smoke**
   - managed agent path
   - connected agent path
   - ACP path

5. **Platform-control smoke**
   - exercise at least one real `stallion-control` action end to end

6. **CLI parity integration**
   - prove route-backed product surfaces remain reachable through `stallion`
   - prefer HTTP-backed vitest command tests for breadth, then add targeted browser or live-app checks only where the CLI contract depends on full runtime behavior

The goal is persistent regression protection. If a test only proves something once and cannot be rerun meaningfully later, it is not enough on its own.

For CLI parity work, prefer:

- one shared HTTP command-contract suite covering multiple CLI families when the requests are mechanically similar
- dedicated route tests when a route family has unusual response shape or lifecycle behavior
- command reference updates in `docs/reference/cli.md` in the same change as the implementation

## Connected Agents Verification

Use these terms consistently when adding connected-agents coverage:

- `Contract test`: provider-native event/request mapping into canonical runtime events
- `Integration test`: Hono route or orchestration service boundary with real collaborators
- `E2E test`: browser-driven flow using route interception or mocked EventSource delivery
- `Smoke test`: real running app via `./stallion`

Focused automation:

```bash
npm run test:connected-agents
PW_BASE_URL=http://localhost:5274 PLAYWRIGHT_BROWSERS_PATH=0 \
  npx playwright test \
  tests/orchestration-provider-picker.spec.ts \
  tests/orchestration-chat-flow.spec.ts \
  tests/orchestration-recovery.spec.ts
```

Live local gate:

```bash
./stallion start --instance=connected-agents-smoke --temp-home --clean --force --port=3242 --ui-port=5274
PW_BASE_URL=http://localhost:5274 PLAYWRIGHT_BROWSERS_PATH=0 \
  npx playwright test \
  tests/orchestration-provider-picker.spec.ts \
  tests/orchestration-chat-flow.spec.ts \
  tests/orchestration-recovery.spec.ts
./stallion stop --instance=connected-agents-smoke
```

Use `--temp-home` for routine local gates. Shared-build actions (`--clean`, `fresh`, `--build`, and self-update) will refuse while sibling instances from the same checkout are still live.

## Shared Test Utilities

### Mock Factories (`src-server/__test-utils__/mocks.ts`)

```ts
import { createMockLogger, createMockEventBus } from '../../__test-utils__/mocks.js';

const logger = createMockLogger();
const eventBus = createMockEventBus();
```

### Route Helpers (`src-server/__test-utils__/route-helpers.ts`)

```ts
import { requestJSON, expectSuccess, expectError } from '../../__test-utils__/route-helpers.js';

const { body } = await requestJSON(app, 'GET', '/jobs');
expectSuccess(body);

const { body: err } = await requestJSON(app, 'DELETE', '/jobs/ghost');
expectError(err, 'not found');
```

## Patterns

### Service Test

```ts
import { describe, expect, test, beforeEach } from 'vitest';
import { createMockLogger } from '../../__test-utils__/mocks.js';
import { MyService } from '../my-service.js';

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    service = new MyService(createMockLogger());
  });

  test('creates a thing', async () => {
    const result = await service.create({ name: 'test' });
    expect(result.name).toBe('test');
  });
});
```

### Route Integration Test

```ts
import { describe, expect, test, beforeEach } from 'vitest';
import { createMockLogger } from '../../__test-utils__/mocks.js';
import { requestJSON, expectSuccess } from '../../__test-utils__/route-helpers.js';
import { createMyRoutes } from '../my-routes.js';

describe('MyRoutes', () => {
  let app: ReturnType<typeof createMyRoutes>;

  beforeEach(() => {
    const service = new MyService(createMockLogger());
    app = createMyRoutes(service, createMockLogger());
  });

  test('GET / returns list', async () => {
    const { body } = await requestJSON(app, 'GET', '/');
    expectSuccess(body);
    expect(body.data).toEqual([]);
  });
});
```

### Hook Test (jsdom)

```ts
// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMyHook } from '../useMyHook.js';

describe('useMyHook', () => {
  test('initial state', () => {
    const { result } = renderHook(() => useMyHook());
    expect(result.current.value).toBe(null);
  });
});
```

## New Feature Checklist

- [ ] Service has unit test in `__tests__/`
- [ ] Route has integration test in `__tests__/`
- [ ] Critical hooks have unit tests
- [ ] E2E test for user-facing flows in `tests/`
- [ ] Coverage does not decrease

## TDD Enforcement Policy

Every new feature or bug fix MUST include tests. This is not optional.

### Rules

1. **No PR without tests.** If you add a service, it gets a `__tests__/<name>.test.ts`. If you add a route, it gets a `__tests__/<name>.routes.test.ts`. If you add a user-facing flow, it gets a `tests/<feature>.spec.ts` Playwright test.

2. **Write tests first when possible.** For new services and routes, write the test file with expected behavior before implementing. For bug fixes, write a failing test that reproduces the bug, then fix it.

3. **Coverage can only go up.** Thresholds are set in `vitest.config.ts`. If `npm run test:coverage` fails, you've decreased coverage — add tests before merging.

4. **Use shared utilities.** Don't reinvent mocks. Use `createMockLogger()` from `__test-utils__/mocks.ts`, `requestJSON()` from `__test-utils__/route-helpers.ts`, and `collectSSE()` from `__test-utils__/sse-helpers.ts`.

5. **Playwright for integration boundaries.** SSE streaming, WebSocket, AWS SDK calls, and UI flows are tested via Playwright with route interception — not unit tests.

### What counts as "tested"

| Change Type | Required Test |
|---|---|
| New service | Unit test covering public API |
| New route | Integration test via `app.request()` |
| New UI component/hook | Playwright e2e test for the user flow |
| Bug fix | Regression test that fails without the fix |
| Refactor | Existing tests still pass (no new tests needed) |

### Connected Agents Checklist

- Adapter changes update the provider contract tests in `src-server/providers/__tests__/`
- Orchestration changes update service, event-store, and route coverage
- UI/state changes update provider-picker, chat-flow, or recovery Playwright specs
- Session recovery changes must prove both restore and fail-closed behavior
- Provider-specific prerequisite or option changes must be asserted end-to-end

### SSE Test Helper

For routes that use `streamSSE`, use the `collectSSE` helper:

```ts
import { collectSSE } from '../../__test-utils__/sse-helpers.js';

const res = await app.request('/events');
const events = await collectSSE(res, { maxEvents: 3, timeoutMs: 500 });
expect(events[0].parsed.type).toBe('connected');
```

### Known Limitations

- **UI hook unit tests** require vitest 2.x for proper jsdom localStorage support. Until then, test hooks through Playwright e2e tests.
- **AWS SDK routes** (bedrock, models) are thin wrappers — test via Playwright with route interception rather than mocking the SDK.
