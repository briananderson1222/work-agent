import { EventEmitter } from 'node:events';
import { describe, expect, test, vi } from 'vitest';
import { collectSSE } from '../../__test-utils__/sse-helpers.js';

vi.mock('../auth.js', () => ({
  getCachedUser: () => ({ alias: 'testuser' }),
}));

const { createMonitoringRoutes } = await import('../monitoring.js');

function createMockDeps() {
  return {
    activeAgents: new Map([
      ['default', { name: 'Default', model: 'claude-3' }],
    ]),
    agentStats: new Map(),
    agentStatus: new Map([['default', 'idle']]),
    memoryAdapters: new Map([
      [
        'default',
        {
          getConversations: vi.fn().mockResolvedValue([]),
          getMessages: vi.fn().mockResolvedValue([]),
        },
      ],
    ]),
    metricsLog: [] as any[],
    monitoringEvents: new EventEmitter(),
    queryEventsFromDisk: vi.fn().mockResolvedValue([]),
    acpBridge: { getStatus: () => ({ connections: [] }) },
  };
}

async function json(res: Response) {
  return res.json();
}

describe('Monitoring Routes', () => {
  test('GET /stats returns agent stats', async () => {
    const app = createMonitoringRoutes(createMockDeps() as any);
    const body = await json(await app.request('/stats'));
    expect(body.success).toBe(true);
    expect(body.data.agents).toHaveLength(1);
    expect(body.data.agents[0].slug).toBe('default');
    expect(body.data.summary).toBeDefined();
  });

  test('GET /metrics returns filtered metrics', async () => {
    const deps = createMockDeps();
    deps.metricsLog.push({
      timestamp: Date.now(),
      agentSlug: 'default',
      event: 'chat',
      messageCount: 5,
    });
    const app = createMonitoringRoutes(deps as any);
    const body = await json(await app.request('/metrics?range=today'));
    expect(body.success).toBe(true);
    expect(body.data.range).toBe('today');
  });

  test('GET /events with time range returns historical JSON', async () => {
    const deps = createMockDeps();
    deps.queryEventsFromDisk.mockResolvedValue([
      { type: 'test', timestamp: Date.now() },
    ]);
    const app = createMonitoringRoutes(deps as any);
    const body = await json(
      await app.request('/events?start=2026-01-01&end=2026-12-31'),
    );
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('GET /events without time range streams SSE', async () => {
    const deps = createMockDeps();
    const app = createMonitoringRoutes(deps as any);
    const res = await app.request('/events');
    const events = await collectSSE(res, { maxEvents: 1, timeoutMs: 500 });
    // First event should be the "connected" system event
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].parsed?.['stallion.system.type']).toBe('connected');
  });
});
