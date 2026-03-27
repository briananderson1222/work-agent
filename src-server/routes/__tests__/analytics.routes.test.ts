import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  analyticsOps: { add: vi.fn() },
}));

const { createAnalyticsRoutes } = await import('../analytics.js');

function createMockAggregator() {
  return {
    loadStats: vi
      .fn()
      .mockResolvedValue({ byDate: {}, totalMessages: 0, totalCost: 0 }),
    getAchievements: vi.fn().mockResolvedValue([]),
    fullRescan: vi.fn().mockResolvedValue({ byDate: {} }),
    reset: vi.fn().mockResolvedValue(undefined),
  };
}

async function json(res: Response) {
  return res.json();
}

describe('Analytics Routes', () => {
  test('GET /usage returns stats', async () => {
    const agg = createMockAggregator();
    const app = createAnalyticsRoutes(agg as any);
    const body = await json(await app.request('/usage'));
    expect(body.data).toBeDefined();
  });

  test('GET /usage returns 500 when not initialized', async () => {
    const app = createAnalyticsRoutes(undefined);
    const res = await app.request('/usage');
    expect(res.status).toBe(500);
  });

  test('GET /usage with date range filters', async () => {
    const agg = createMockAggregator();
    agg.loadStats.mockResolvedValue({
      byDate: {
        '2026-03-20': { messages: 5, cost: 0.1 },
        '2026-03-21': { messages: 3, cost: 0.05 },
      },
    });
    const app = createAnalyticsRoutes(agg as any);
    const body = await json(
      await app.request('/usage?from=2026-03-21&to=2026-03-21'),
    );
    expect(Object.keys(body.data.byDate)).toEqual(['2026-03-21']);
    expect(body.data.rangeSummary).toBeDefined();
  });

  test('GET /achievements returns list', async () => {
    const agg = createMockAggregator();
    const app = createAnalyticsRoutes(agg as any);
    const body = await json(await app.request('/achievements'));
    expect(body.data).toEqual([]);
  });

  test('POST /rescan triggers full rescan', async () => {
    const agg = createMockAggregator();
    const app = createAnalyticsRoutes(agg as any);
    const body = await json(await app.request('/rescan', { method: 'POST' }));
    expect(body.message).toContain('rescan');
    expect(agg.fullRescan).toHaveBeenCalled();
  });

  test('DELETE /usage resets stats', async () => {
    const agg = createMockAggregator();
    const app = createAnalyticsRoutes(agg as any);
    const body = await json(await app.request('/usage', { method: 'DELETE' }));
    expect(body.success).toBe(true);
    expect(agg.reset).toHaveBeenCalled();
  });
});
