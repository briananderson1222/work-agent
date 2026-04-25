import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// ── Temp dir isolation — respect the shared test home override if present ──

const tempDir =
  process.env.STALLION_AI_DIR ||
  join(tmpdir(), `scheduler-test-${process.pid}`);

// Mock chatFn for executeJob tests
let chatFnBehavior: { ok: boolean; text: string } = { ok: true, text: 'done' };
const mockChatFn = vi.fn(async () => {
  if (!chatFnBehavior.ok) throw new Error('Agent error');
  return chatFnBehavior.text;
});

// Must import AFTER mock so module-level constants use the mocked homedir
const { BuiltinScheduler, nextCronTimes } = await import(
  '../builtin-scheduler.js'
);
const { SchedulerService } = await import('../scheduler-service.js');
const { createSchedulerRoutes } = await import('../../routes/scheduler.js');

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

beforeEach(() => {
  rmSync(join(tempDir, 'scheduler'), { recursive: true, force: true });
  mkdirSync(join(tempDir, 'scheduler', 'logs'), { recursive: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Cron Engine ──

describe('nextCronTimes', () => {
  test('returns correct count of future times', () => {
    const after = new Date('2026-01-01T00:00:00Z');
    const times = nextCronTimes('0 * * * *', 3, after); // every hour
    expect(times).toHaveLength(3);
    expect(times[0]).toEqual(new Date('2026-01-01T01:00:00Z'));
    expect(times[1]).toEqual(new Date('2026-01-01T02:00:00Z'));
    expect(times[2]).toEqual(new Date('2026-01-01T03:00:00Z'));
  });

  test('handles step values', () => {
    const after = new Date('2025-12-31T23:59:00Z');
    const times = nextCronTimes('*/15 * * * *', 4, after);
    expect(times).toHaveLength(4);
    expect(times[0].getUTCMinutes()).toBe(0);
    expect(times[1].getUTCMinutes()).toBe(15);
    expect(times[2].getUTCMinutes()).toBe(30);
    expect(times[3].getUTCMinutes()).toBe(45);
  });

  test('handles range fields', () => {
    const after = new Date('2026-01-01T00:00:00Z');
    const times = nextCronTimes('0 9-11 * * *', 3, after);
    expect(times.map((t) => t.getUTCHours())).toEqual([9, 10, 11]);
  });

  test('handles comma-separated values', () => {
    const after = new Date('2026-01-01T00:00:00Z');
    const times = nextCronTimes('0 6,12,18 * * *', 3, after);
    expect(times.map((t) => t.getUTCHours())).toEqual([6, 12, 18]);
  });

  test('handles day-of-week field', () => {
    // 2026-01-05 is a Monday (dow=1)
    const after = new Date('2026-01-04T00:00:00Z'); // Sunday
    const times = nextCronTimes('0 0 * * 1', 1, after); // every Monday
    expect(times[0].getUTCDay()).toBe(1);
  });

  test('returns empty for impossible cron', () => {
    const after = new Date('2026-01-01T00:00:00Z');
    // Feb 31 never exists
    const times = nextCronTimes('0 0 31 2 *', 1, after);
    expect(times).toHaveLength(0);
  });
});

// ── BuiltinScheduler CRUD ──

describe('BuiltinScheduler', () => {
  let scheduler: InstanceType<typeof BuiltinScheduler>;

  beforeEach(() => {
    scheduler = new BuiltinScheduler();
    scheduler.setChatFn(mockChatFn);
  });

  afterEach(() => {
    scheduler.stop();
  });

  test('addJob creates a job and listJobs returns it', async () => {
    await scheduler.addJob({
      name: 'test-job',
      prompt: 'do stuff',
      cron: '0 * * * *',
    });
    const jobs = await scheduler.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      name: 'test-job',
      prompt: 'do stuff',
      cron: '0 * * * *',
      enabled: true,
      provider: 'built-in',
    });
  });

  test('addJob rejects duplicate names', async () => {
    await scheduler.addJob({ name: 'dup', prompt: 'a' });
    await expect(
      scheduler.addJob({ name: 'dup', prompt: 'b' }),
    ).rejects.toThrow("Job 'dup' already exists");
  });

  test('addJob validates name is required', async () => {
    await expect(scheduler.addJob({ name: '', prompt: 'x' })).rejects.toThrow(
      'Job name is required',
    );
  });

  test('addJob validates prompt is required', async () => {
    await expect(scheduler.addJob({ name: 'x', prompt: '' })).rejects.toThrow(
      'Job prompt is required',
    );
  });

  test('editJob updates allowed fields', async () => {
    await scheduler.addJob({
      name: 'edit-me',
      prompt: 'original',
      cron: '0 * * * *',
    });
    await scheduler.editJob('edit-me', {
      prompt: 'updated',
      cron: '*/5 * * * *',
    });
    const jobs = await scheduler.listJobs();
    expect(jobs[0]).toMatchObject({ prompt: 'updated', cron: '*/5 * * * *' });
  });

  test('editJob blocks protected fields', async () => {
    await scheduler.addJob({ name: 'protect-me', prompt: 'test' });
    const before = (await scheduler.listJobs())[0];
    await scheduler.editJob('protect-me', {
      name: 'hacked',
      createdAt: '1999-01-01',
    } as any);
    const after = (await scheduler.listJobs())[0];
    expect(after.name).toBe('protect-me');
    expect((after as any).createdAt).toBe((before as any).createdAt);
  });

  test('editJob throws for non-existent job', async () => {
    await expect(scheduler.editJob('ghost', { prompt: 'x' })).rejects.toThrow(
      "Job 'ghost' not found",
    );
  });

  test('removeJob deletes the job', async () => {
    await scheduler.addJob({ name: 'rm-me', prompt: 'bye' });
    await scheduler.removeJob('rm-me');
    expect(await scheduler.listJobs()).toHaveLength(0);
  });

  test('removeJob throws for non-existent job', async () => {
    await expect(scheduler.removeJob('nope')).rejects.toThrow(
      "Job 'nope' not found",
    );
  });

  test('enableJob / disableJob toggles enabled flag', async () => {
    await scheduler.addJob({
      name: 'toggle',
      prompt: 'test',
      cron: '0 * * * *',
    });
    await scheduler.disableJob('toggle');
    expect((await scheduler.listJobs())[0].enabled).toBe(false);
    await scheduler.enableJob('toggle');
    expect((await scheduler.listJobs())[0].enabled).toBe(true);
  });

  test('runJob throws for non-existent job', async () => {
    await expect(scheduler.runJob('missing')).rejects.toThrow(
      "Job 'missing' not found",
    );
  });

  test('getStats returns zero-based stats for jobs with no runs', async () => {
    await scheduler.addJob({ name: 'no-runs', prompt: 'test' });
    const stats = await scheduler.getStats();
    expect(stats.jobs[0]).toMatchObject({
      name: 'no-runs',
      total: 0,
      successes: 0,
      failures: 0,
      success_rate: 0,
    });
  });

  test('getStatus reflects running state', async () => {
    expect((await scheduler.getStatus()).running).toBe(false);
    scheduler.start();
    expect((await scheduler.getStatus()).running).toBe(true);
    scheduler.stop();
    expect((await scheduler.getStatus()).running).toBe(false);
  });

  test('getJobLogs returns empty for job with no runs', async () => {
    await scheduler.addJob({ name: 'no-logs', prompt: 'test' });
    expect(await scheduler.getJobLogs('no-logs')).toEqual([]);
  });

  test('previewSchedule returns ISO strings', async () => {
    const previews = await scheduler.previewSchedule('0 12 * * *', 2);
    expect(previews).toHaveLength(2);
    previews.forEach((p) => expect(() => new Date(p)).not.toThrow());
  });

  test('subscribe / unsubscribe manages SSE clients', () => {
    const messages: string[] = [];
    const unsub = scheduler.subscribe((d) => messages.push(d));
    // Trigger a broadcast indirectly via start (tick won't match, but we can test subscribe works)
    unsub();
    // After unsubscribe, no more messages
    expect(typeof unsub).toBe('function');
  });

  test('listJobs includes nextRun for enabled cron jobs', async () => {
    await scheduler.addJob({
      name: 'cron-job',
      prompt: 'test',
      cron: '0 * * * *',
    });
    const jobs = await scheduler.listJobs();
    expect(jobs[0].nextRun).toBeDefined();
    expect(() => new Date(jobs[0].nextRun!)).not.toThrow();
  });

  test('listJobs omits nextRun for disabled jobs', async () => {
    await scheduler.addJob({
      name: 'disabled-job',
      prompt: 'test',
      cron: '0 * * * *',
    });
    await scheduler.disableJob('disabled-job');
    const jobs = await scheduler.listJobs();
    expect(jobs[0].nextRun).toBeUndefined();
  });

  test('runJob executes and creates log entry', async () => {
    chatFnBehavior = { ok: true, text: 'job output here' };
    await scheduler.addJob({ name: 'exec-job', prompt: 'do stuff' });
    await scheduler.runJob('exec-job');
    await new Promise((r) => setTimeout(r, 50));
    const logs = await scheduler.getJobLogs('exec-job');
    expect(logs).toHaveLength(1);
    expect(logs[0].success).toBe(true);
    expect(logs[0].job).toBe('exec-job');
    expect(logs[0].durationSecs).toBeGreaterThanOrEqual(0);
  });

  test('runJob records failure on agent error', async () => {
    chatFnBehavior = { ok: false, text: '' };
    await scheduler.addJob({ name: 'fail-job', prompt: 'break' });
    await scheduler.runJob('fail-job');
    await new Promise((r) => setTimeout(r, 50));
    const logs = await scheduler.getJobLogs('fail-job');
    expect(logs).toHaveLength(1);
    expect(logs[0].success).toBe(false);
  });

  test('runJob writes output file readable through the provider file guard', async () => {
    chatFnBehavior = { ok: true, text: 'captured output' };
    await scheduler.addJob({ name: 'output-job', prompt: 'test' });
    await scheduler.runJob('output-job');
    await new Promise((r) => setTimeout(r, 50));
    const logs = await scheduler.getJobLogs('output-job');
    expect(logs[0].output).toBeTruthy();
    const output = await scheduler.readRunFile(logs[0].output!);
    expect(output).toBe('captured output');
  });

  test('runJob broadcasts started and completed events', async () => {
    chatFnBehavior = { ok: true, text: 'ok' };
    const events: any[] = [];
    scheduler.subscribe((d) => events.push(JSON.parse(d)));
    await scheduler.addJob({ name: 'event-job', prompt: 'test' });
    await scheduler.runJob('event-job');
    await new Promise((r) => setTimeout(r, 50));
    expect(
      events.some((e) => e.event === 'job.started' && e.job === 'event-job'),
    ).toBe(true);
    expect(
      events.some((e) => e.event === 'job.completed' && e.job === 'event-job'),
    ).toBe(true);
  });

  test('runJob broadcasts failed event on error', async () => {
    chatFnBehavior = { ok: false, text: '' };
    const events: any[] = [];
    scheduler.subscribe((d) => events.push(JSON.parse(d)));
    await scheduler.addJob({ name: 'fail-event-job', prompt: 'test' });
    await scheduler.runJob('fail-event-job');
    await new Promise((r) => setTimeout(r, 50));
    expect(
      events.some(
        (e) => e.event === 'job.failed' && e.job === 'fail-event-job',
      ),
    ).toBe(true);
  });

  test('getStats reflects runs after execution', async () => {
    chatFnBehavior = { ok: true, text: 'ok' };
    await scheduler.addJob({ name: 'stats-job', prompt: 'test' });
    await scheduler.runJob('stats-job');
    await new Promise((r) => setTimeout(r, 50));
    const stats = await scheduler.getStats();
    const jobStats = stats.jobs.find((j) => j.name === 'stats-job');
    expect(jobStats?.total).toBe(1);
    expect(jobStats?.successes).toBe(1);
    expect(jobStats?.success_rate).toBe(100);
  });
});

// ── SchedulerService ──

describe('SchedulerService', () => {
  let service: InstanceType<typeof SchedulerService>;

  beforeEach(() => {
    service = new SchedulerService(mockLogger);
  });

  afterEach(() => {
    // Stop the builtin scheduler's timer
    (service as any).builtin.stop();
  });

  test('listProviders includes built-in', () => {
    const providers = service.listProviders();
    expect(providers.length).toBeGreaterThanOrEqual(1);
    expect(providers.find((p) => p.id === 'built-in')).toBeDefined();
  });

  test('addJob and listJobs round-trip', async () => {
    await service.addJob({ name: 'svc-job', prompt: 'hello' });
    const jobs = await service.listJobs();
    expect(jobs.some((j) => j.name === 'svc-job')).toBe(true);
  });

  test('editJob routes to correct provider', async () => {
    await service.addJob({ name: 'svc-edit', prompt: 'original' });
    await service.editJob('svc-edit', { prompt: 'changed' });
    const jobs = await service.listJobs();
    expect(jobs.find((j) => j.name === 'svc-edit')?.prompt).toBe('changed');
  });

  test('removeJob routes to correct provider', async () => {
    await service.addJob({ name: 'svc-rm', prompt: 'bye' });
    await service.removeJob('svc-rm');
    const jobs = await service.listJobs();
    expect(jobs.some((j) => j.name === 'svc-rm')).toBe(false);
  });

  test('removeJob throws for unknown job', async () => {
    await expect(service.removeJob('ghost')).rejects.toThrow();
  });

  test('getStats returns successRate 0 when no runs', async () => {
    const stats = await service.getStats();
    expect(stats.summary.successRate).toBe(0);
  });

  test('getStatus includes built-in provider', async () => {
    const status = await service.getStatus();
    expect(status.providers['built-in']).toBeDefined();
    expect(status.providers['built-in'].running).toBe(true);
  });

  test('previewSchedule returns ISO strings', async () => {
    const previews = await service.previewSchedule('0 12 * * *', 3);
    expect(previews).toHaveLength(3);
    previews.forEach((p) => expect(p).toMatch(/^\d{4}-\d{2}-\d{2}T/));
  });

  test('addProvider registers a custom provider', async () => {
    const mock: any = {
      id: 'mock-provider',
      displayName: 'Mock',
      capabilities: [],
      listJobs: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({ jobs: [] }),
      getStatus: vi.fn().mockResolvedValue({ running: true, jobCount: 0 }),
    };
    service.addProvider(mock);
    const providers = service.listProviders();
    expect(providers.find((p) => p.id === 'mock-provider')).toBeDefined();
  });
});

// ── Route Handlers ──

describe('Scheduler Routes', () => {
  let service: InstanceType<typeof SchedulerService>;
  let app: ReturnType<typeof createSchedulerRoutes>;

  beforeEach(() => {
    service = new SchedulerService(mockLogger);
    app = createSchedulerRoutes(service, mockLogger);
  });

  afterEach(() => {
    (service as any).builtin.stop();
  });

  const json = async (res: Response) => res.json();

  test('GET /providers returns provider list', async () => {
    const res = await app.request('/providers');
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.some((p: any) => p.id === 'built-in')).toBe(true);
  });

  test('POST /jobs creates a job', async () => {
    const res = await app.request('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'route-job',
        prompt: 'test',
        cron: '0 * * * *',
      }),
    });
    const body = await json(res);
    expect(body.success).toBe(true);
  });

  test('GET /jobs lists jobs', async () => {
    await app.request('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'list-me', prompt: 'test' }),
    });
    const res = await app.request('/jobs');
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.some((j: any) => j.name === 'list-me')).toBe(true);
  });

  test('PUT /jobs/:target edits a job', async () => {
    await app.request('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'edit-route', prompt: 'original' }),
    });
    const res = await app.request('/jobs/edit-route', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'updated' }),
    });
    expect((await json(res)).success).toBe(true);
  });

  test('DELETE /jobs/:target removes a job', async () => {
    await app.request('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'del-route', prompt: 'bye' }),
    });
    const res = await app.request('/jobs/del-route', { method: 'DELETE' });
    expect((await json(res)).success).toBe(true);
  });

  test('DELETE /jobs/:target returns 500 for missing job', async () => {
    const res = await app.request('/jobs/nonexistent', { method: 'DELETE' });
    expect(res.status).toBe(500);
    expect((await json(res)).success).toBe(false);
  });

  test('PUT /jobs/:target/enable enables a job', async () => {
    await app.request('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'enable-me', prompt: 'test' }),
    });
    const res = await app.request('/jobs/enable-me/enable', { method: 'PUT' });
    expect((await json(res)).success).toBe(true);
  });

  test('PUT /jobs/:target/disable disables a job', async () => {
    await app.request('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'disable-me', prompt: 'test' }),
    });
    const res = await app.request('/jobs/disable-me/disable', {
      method: 'PUT',
    });
    expect((await json(res)).success).toBe(true);
  });

  test('GET /stats returns stats', async () => {
    const res = await app.request('/stats');
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.summary.successRate).toBe(0);
  });

  test('GET /status returns status', async () => {
    const res = await app.request('/status');
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.providers['built-in']).toBeDefined();
  });

  test('GET /jobs/preview-schedule returns times', async () => {
    const res = await app.request(
      '/jobs/preview-schedule?cron=0+*+*+*+*&count=3',
    );
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(3);
  });

  test('GET /jobs/preview-schedule requires cron param', async () => {
    const res = await app.request('/jobs/preview-schedule');
    expect(res.status).toBe(400);
  });

  test('GET /jobs/:target/logs returns logs', async () => {
    await app.request('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'log-job', prompt: 'test' }),
    });
    const res = await app.request('/jobs/log-job/logs');
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test('POST /webhook broadcasts event', async () => {
    const res = await app.request('/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'job.completed', job: 'test' }),
    });
    expect((await json(res)).success).toBe(true);
  });

  test('POST /jobs/:target/run returns 500 for missing job', async () => {
    const res = await app.request('/jobs/ghost/run', { method: 'POST' });
    expect(res.status).toBe(500);
  });
});
