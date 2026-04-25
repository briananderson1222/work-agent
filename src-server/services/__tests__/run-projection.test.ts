import { describe, expect, test } from 'vitest';
import {
  createScheduleRunId,
  parseScheduleRunId,
  projectSchedulerLogToRun,
} from '../run-projection.js';

describe('run projection', () => {
  test('projects scheduler logs into provider-qualified schedule runs', () => {
    const run = projectSchedulerLogToRun('plugin-a', {
      id: 'daily-1710000000',
      job: 'daily report',
      startedAt: '2026-04-25T12:00:00.000Z',
      completedAt: '2026-04-25T12:00:03.000Z',
      success: true,
      durationSecs: 3,
      manual: true,
      output: '/tmp/stallion/scheduler/logs/daily.log',
      attempt: 1,
      maxAttempts: 3,
    });

    expect(run).toMatchObject({
      runId: 'schedule:plugin-a:daily%20report:daily-1710000000',
      providerId: 'plugin-a',
      source: 'schedule',
      sourceId: 'daily report',
      status: 'completed',
      attempt: 1,
      maxAttempts: 3,
      outputRef: {
        source: 'schedule',
        providerId: 'plugin-a',
        kind: 'output',
        artifactId: 'daily-1710000000',
      },
      metadata: {
        manual: true,
        durationSecs: 3,
        legacyLogId: 'daily-1710000000',
      },
    });
  });

  test('keeps duplicate job and log ids distinct across providers', () => {
    const first = createScheduleRunId('provider-one', 'shared', 'run-1');
    const second = createScheduleRunId('provider-two', 'shared', 'run-1');

    expect(first).not.toBe(second);
    expect(parseScheduleRunId(first)).toEqual({
      providerId: 'provider-one',
      jobName: 'shared',
      logId: 'run-1',
    });
    expect(parseScheduleRunId(second)).toEqual({
      providerId: 'provider-two',
      jobName: 'shared',
      logId: 'run-1',
    });
  });

  test('failed scheduler logs expose conservative failure and retry state', () => {
    const run = projectSchedulerLogToRun('built-in', {
      id: 'run-2',
      job: 'nightly',
      startedAt: '2026-04-25T12:00:00.000Z',
      completedAt: '2026-04-25T12:00:03.000Z',
      success: false,
      error: 'agent failed',
      attempt: 1,
      maxAttempts: 2,
    });

    expect(run.status).toBe('failed');
    expect(run.failureKind).toBe('agent_error');
    expect(run.failureMessage).toBe('agent failed');
    expect(run.retryEligible).toBe(true);
    expect(run.outputRef).toBeUndefined();
  });
});
