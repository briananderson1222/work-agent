import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';

const tempDir =
  process.env.STALLION_AI_DIR ||
  join(tmpdir(), `scheduler-storage-test-${process.pid}`);

const storage = await import('../builtin-scheduler-storage.js');

beforeEach(() => {
  rmSync(join(tempDir, 'scheduler'), { recursive: true, force: true });
  mkdirSync(join(tempDir, 'scheduler', 'logs'), { recursive: true });
});

describe('builtin-scheduler-storage', () => {
  test('stores and summarizes job logs', () => {
    storage.writeStoredJobs([
      {
        name: 'nightly',
        prompt: 'run',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    storage.appendSchedulerJobLog('nightly', {
      id: 'nightly-1',
      job: 'nightly',
      startedAt: '2026-01-01T01:00:00.000Z',
      completedAt: '2026-01-01T01:00:05.000Z',
      success: true,
      durationSecs: 5,
      output: '/tmp/nightly-1.log',
      attempt: 1,
      maxAttempts: 1,
    });

    expect(storage.getStoredJobStats()).toEqual({
      jobs: [
        {
          name: 'nightly',
          total: 1,
          successes: 1,
          failures: 0,
          success_rate: 100,
        },
      ],
    });

    expect(storage.getStoredJobView(storage.readStoredJobs()[0])).toMatchObject({
      name: 'nightly',
      lastRun: '2026-01-01T01:00:00.000Z',
    });
  });

  test('guards run file reads to the scheduler logs directory', () => {
    const outputPath = storage.getSchedulerRunOutputPath('nightly-1');
    writeFileSync(outputPath, 'ok');

    expect(storage.readSchedulerRunFile(outputPath)).toBe('ok');

    const outsidePath = join(tempDir, 'outside.log');
    writeFileSync(outsidePath, 'nope');
    expect(() => storage.readSchedulerRunFile(outsidePath)).toThrow(
      'Invalid path',
    );

    const siblingLogsPath = join(tempDir, 'scheduler', 'logs-archive');
    mkdirSync(siblingLogsPath, { recursive: true });
    const siblingOutputPath = join(siblingLogsPath, 'nightly-2.log');
    writeFileSync(siblingOutputPath, 'still nope');
    expect(() => storage.readSchedulerRunFile(siblingOutputPath)).toThrow(
      'Invalid path',
    );
  });
});
