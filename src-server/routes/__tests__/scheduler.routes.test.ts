import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  schedulerJobRuns: { add: vi.fn() },
}));

vi.mock('../../services/cron.js', () => ({
  validateCron: () => false,
}));

const { createSchedulerRoutes } = await import('../scheduler.js');

// Realistic shapes matching what the UI reads
const mockJob = {
  target: 'daily-report',
  name: 'daily-report',
  cron: '0 9 * * *',
  prompt: 'Generate daily report',
  agent: 'default',
  enabled: true,
  lastRun: '2026-03-26T09:00:00Z',
  nextRun: '2026-03-27T09:00:00Z',
  provider: 'builtin',
};

const mockStats = {
  providers: {
    builtin: { totalJobs: 2, totalRuns: 10, successRate: 0.9 },
  },
  summary: { totalJobs: 2, totalRuns: 10, successRate: 0.9 },
};

const mockStatus = {
  providers: {
    builtin: {
      id: 'builtin',
      displayName: 'Built-in',
      running: true,
      lastTick: '2026-03-27T07:00:00Z',
    },
  },
};

const mockProvider = {
  id: 'builtin',
  displayName: 'Built-in Scheduler',
  capabilities: ['cron', 'manual'],
};

function createMockService() {
  return {
    listProviders: vi.fn().mockReturnValue([mockProvider]),
    listJobs: vi.fn().mockResolvedValue([mockJob]),
    getStats: vi.fn().mockResolvedValue(mockStats),
    getStatus: vi.fn().mockResolvedValue(mockStatus),
    previewSchedule: vi
      .fn()
      .mockResolvedValue(['2026-03-28T09:00:00Z', '2026-03-29T09:00:00Z']),
    getJobLogs: vi.fn().mockResolvedValue([
      {
        timestamp: '2026-03-27T09:00:00Z',
        status: 'success',
        output: '/path/to/output.md',
      },
    ]),
    readRunFile: vi.fn().mockResolvedValue('# Report content'),
    addJob: vi.fn().mockResolvedValue('created'),
    editJob: vi.fn().mockResolvedValue('updated'),
    runJob: vi.fn().mockResolvedValue('started'),
    enableJob: vi.fn().mockResolvedValue(undefined),
    disableJob: vi.fn().mockResolvedValue(undefined),
    removeJob: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(() => {}),
    broadcast: vi.fn(),
  };
}

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

function setup() {
  const svc = createMockService();
  const app = createSchedulerRoutes(svc as any, logger as any);
  return { app, svc };
}

async function json(res: Response) {
  return res.json();
}

describe('Scheduler Routes', () => {
  // ── Contract: SDK schedulerFetch expects { success: true, data: T } ──

  test('GET /providers returns { success, data } with id/displayName/capabilities', async () => {
    const { app } = setup();
    const body = await json(await app.request('/providers'));
    expect(body).toEqual({ success: true, data: [mockProvider] });
    expect(body.data[0]).toHaveProperty('id');
    expect(body.data[0]).toHaveProperty('displayName');
    expect(body.data[0]).toHaveProperty('capabilities');
  });

  test('GET /jobs returns { success, data } with job objects', async () => {
    const { app } = setup();
    const body = await json(await app.request('/jobs'));
    expect(body.success).toBe(true);
    expect(body.data[0]).toMatchObject({
      target: 'daily-report',
      name: 'daily-report',
      cron: '0 9 * * *',
      enabled: true,
    });
  });

  test('GET /jobs returns 500 on error', async () => {
    const { app, svc } = setup();
    svc.listJobs.mockRejectedValue(new Error('fail'));
    const res = await app.request('/jobs');
    expect(res.status).toBe(500);
  });

  test('GET /stats returns { success, data } with providers + summary', async () => {
    const { app } = setup();
    const body = await json(await app.request('/stats'));
    expect(body.success).toBe(true);
    // UI reads stats.providers and stats.summary.totalRuns/successRate
    expect(body.data.providers).toBeDefined();
    expect(body.data.summary).toMatchObject({
      totalJobs: expect.any(Number),
      totalRuns: expect.any(Number),
      successRate: expect.any(Number),
    });
  });

  test('GET /status returns { success, data } with providers map', async () => {
    const { app } = setup();
    const body = await json(await app.request('/status'));
    expect(body.success).toBe(true);
    // UI reads status.providers
    expect(body.data.providers).toBeDefined();
    expect(body.data.providers.builtin).toHaveProperty('running');
  });

  test('GET /jobs/preview-schedule returns array of date strings', async () => {
    const { app } = setup();
    const body = await json(
      await app.request('/jobs/preview-schedule?cron=*/5+*+*+*+*'),
    );
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('GET /jobs/preview-schedule returns 400 without cron', async () => {
    const { app } = setup();
    const res = await app.request('/jobs/preview-schedule');
    expect(res.status).toBe(400);
  });

  test('GET /jobs/:target/logs returns array of log entries', async () => {
    const { app } = setup();
    const body = await json(await app.request('/jobs/daily-report/logs'));
    expect(body.success).toBe(true);
    expect(body.data[0]).toHaveProperty('timestamp');
    expect(body.data[0]).toHaveProperty('status');
  });

  test('POST /runs/output returns { success, data: { content } }', async () => {
    const { app } = setup();
    const body = await json(
      await app.request('/runs/output', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/tmp/output.md' }),
      }),
    );
    expect(body.success).toBe(true);
    expect(body.data.content).toBe('# Report content');
  });

  test('POST /jobs creates a job and returns { success, data }', async () => {
    const { app, svc } = setup();
    const body = await json(
      await app.request('/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test-job', prompt: 'do stuff' }),
      }),
    );
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(svc.addJob).toHaveBeenCalled();
  });

  test('PUT /jobs/:target edits a job', async () => {
    const { app, svc } = setup();
    const body = await json(
      await app.request('/jobs/daily-report', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'updated prompt' }),
      }),
    );
    expect(body.success).toBe(true);
    expect(svc.editJob).toHaveBeenCalledWith(
      'daily-report',
      expect.any(Object),
    );
  });

  test('POST /jobs/:target/run triggers a run', async () => {
    const { app, svc } = setup();
    const body = await json(
      await app.request('/jobs/daily-report/run', { method: 'POST' }),
    );
    expect(body.success).toBe(true);
    expect(svc.runJob).toHaveBeenCalledWith('daily-report');
  });

  // SDK schedulerMutate returns json.data — these return { success: true } with no data field.
  // That's fine (mutations don't use the return value), but verify the shape is stable.

  test('PUT /jobs/:target/enable returns { success: true }', async () => {
    const { app, svc } = setup();
    const body = await json(
      await app.request('/jobs/daily-report/enable', { method: 'PUT' }),
    );
    expect(body).toEqual({ success: true });
    expect(svc.enableJob).toHaveBeenCalledWith('daily-report');
  });

  test('PUT /jobs/:target/disable returns { success: true }', async () => {
    const { app, svc } = setup();
    const body = await json(
      await app.request('/jobs/daily-report/disable', { method: 'PUT' }),
    );
    expect(body).toEqual({ success: true });
    expect(svc.disableJob).toHaveBeenCalledWith('daily-report');
  });

  test('DELETE /jobs/:target returns { success: true }', async () => {
    const { app, svc } = setup();
    const body = await json(
      await app.request('/jobs/daily-report', { method: 'DELETE' }),
    );
    expect(body).toEqual({ success: true });
    expect(svc.removeJob).toHaveBeenCalledWith('daily-report');
  });
});
