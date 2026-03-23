import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  uiCommandOps: { add: vi.fn() },
}));

const { createUICommandRoutes } = await import('../ui-commands.js');
const { EventBus } = await import('../../services/event-bus.js');

async function json(res: Response) { return res.json(); }

describe('UI Command Routes', () => {
  test('POST / navigate emits event', async () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.subscribe(fn);
    const app = createUICommandRoutes(bus);
    const body = await json(await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'navigate', payload: { path: '/settings' } }),
    }));
    expect(body.success).toBe(true);
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ event: 'ui:navigate' }));
  });

  test('POST / navigate rejects invalid paths', async () => {
    const app = createUICommandRoutes(new EventBus());
    const cases = ['http://evil.com', 'javascript:alert(1)', '//evil.com', 'relative'];
    for (const path of cases) {
      const res = await app.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'navigate', payload: { path } }),
      });
      expect(res.status).toBe(400);
    }
  });

  test('POST / unknown command returns 400', async () => {
    const app = createUICommandRoutes(new EventBus());
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'unknown', payload: {} }),
    });
    expect(res.status).toBe(400);
  });
});
