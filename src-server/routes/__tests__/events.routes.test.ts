import { describe, expect, test, vi } from 'vitest';
import { collectSSE } from '../../__test-utils__/sse-helpers.js';

vi.mock('../../telemetry/metrics.js', () => ({
  sseOps: { add: vi.fn() },
}));

const { createEventRoutes } = await import('../events.js');
const { EventBus } = await import('../../services/event-bus.js');

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

describe('Event Routes (SSE)', () => {
  test('GET / streams initial ACP status event', async () => {
    const bus = new EventBus();
    const app = createEventRoutes({
      eventBus: bus,
      getACPStatus: () => ({ connected: false, connections: [] }),
      logger: mockLogger,
    });

    const res = await app.request('/');
    const events = await collectSSE(res, { maxEvents: 1, timeoutMs: 500 });

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].event).toBe('acp:status');
    expect(events[0].parsed).toEqual({ connected: false, connections: [] });
  });

  test('GET / streams events emitted on the bus', async () => {
    const bus = new EventBus();
    const app = createEventRoutes({
      eventBus: bus,
      getACPStatus: () => ({ connected: false, connections: [] }),
      logger: mockLogger,
    });

    // Start the SSE stream
    const resPromise = app.request('/');

    // Give the stream time to connect, then emit
    await new Promise((r) => setTimeout(r, 50));
    bus.emit('test:event', { key: 'value' });

    const res = await resPromise;
    const events = await collectSSE(res, { maxEvents: 3, timeoutMs: 500 });

    // Should have ACP status + our custom event
    expect(events.some((e) => e.event === 'acp:status')).toBe(true);
  });
});
