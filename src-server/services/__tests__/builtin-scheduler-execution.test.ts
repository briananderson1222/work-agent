import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { executeSchedulerJobAttempt } from '../builtin-scheduler-execution.js';

const tempDir =
  process.env.STALLION_AI_DIR ||
  join('/tmp', `scheduler-execution-test-${process.pid}`);

describe('executeSchedulerJobAttempt', () => {
  afterEach(() => {
    rmSync(join(tempDir, 'scheduler'), { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test('records a successful run and completion broadcast', async () => {
    mkdirSync(join(tempDir, 'scheduler', 'logs'), { recursive: true });
    const broadcast = vi.fn();
    const result = await executeSchedulerJobAttempt({
      job: {
        name: 'success-job',
        prompt: 'run',
        enabled: true,
        createdAt: new Date().toISOString(),
      },
      id: 'success-job-1',
      manual: true,
      attempt: 1,
      maxAttempts: 1,
      startedAt: new Date().toISOString(),
      chatFn: vi.fn().mockResolvedValue('ok'),
      notificationService: null,
      broadcast,
      getMissedCount: () => 0,
    });

    expect(result.success).toBe(true);
    expect(readFileSync(result.outputPath, 'utf-8')).toBe('ok');
    expect(
      broadcast.mock.calls.some(
        ([event]) =>
          event.event === 'job.completed' && event.job === 'success-job',
      ),
    ).toBe(true);
  });

  test('records a failed run and schedules notification when not retrying', async () => {
    mkdirSync(join(tempDir, 'scheduler', 'logs'), { recursive: true });
    const notificationService = { schedule: vi.fn() };
    const broadcast = vi.fn();
    const result = await executeSchedulerJobAttempt({
      job: {
        name: 'failure-job',
        prompt: 'run',
        enabled: true,
        createdAt: new Date().toISOString(),
      },
      id: 'failure-job-1',
      manual: false,
      attempt: 1,
      maxAttempts: 1,
      startedAt: new Date().toISOString(),
      chatFn: vi.fn().mockRejectedValue(new Error('boom')),
      notificationService: notificationService as any,
      broadcast,
      getMissedCount: () => 2,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
    expect(readFileSync(result.outputPath, 'utf-8')).toBe('boom');
    expect(
      broadcast.mock.calls.some(
        ([event]) =>
          event.event === 'job.failed' && event.job === 'failure-job',
      ),
    ).toBe(true);
    expect(notificationService.schedule).toHaveBeenCalledOnce();
  });
});
