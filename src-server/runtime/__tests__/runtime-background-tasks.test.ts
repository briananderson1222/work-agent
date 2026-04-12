import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  mergeRuntimeACPConnections,
  scheduleRuntimeDailyReload,
  scheduleRuntimePluginUpdateCheck,
} from '../runtime-background-tasks.js';

describe('mergeRuntimeACPConnections', () => {
  test('merges provider ACP connections without duplicating configured ids', () => {
    const merged = mergeRuntimeACPConnections(
      [
        { id: 'configured-1', name: 'Configured One' },
        { id: 'shared', name: 'Configured Shared' },
      ],
      [
        {
          provider: {
            getConnections: () => [
              { id: 'provider-1', name: 'Provider One' },
              { id: 'shared', name: 'Provider Shared' },
            ],
          },
        },
      ],
    );

    expect(merged).toEqual([
      { id: 'configured-1', name: 'Configured One' },
      { id: 'shared', name: 'Configured Shared' },
      { id: 'provider-1', name: 'Provider One' },
    ]);
  });
});

describe('scheduleRuntimeDailyReload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T18:30:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('schedules reload for the next midnight and reschedules after running', async () => {
    const timers: NodeJS.Timeout[] = [];
    const reloadAgents = vi.fn(async () => {});

    scheduleRuntimeDailyReload({ timers, reloadAgents });

    expect(timers).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5.5 * 60 * 60 * 1000);
    expect(reloadAgents).toHaveBeenCalledTimes(1);
    expect(timers.length).toBeGreaterThanOrEqual(2);
  });
});

describe('scheduleRuntimePluginUpdateCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('emits an event when plugin updates are available', async () => {
    const timers: NodeJS.Timeout[] = [];
    const eventBus = { emit: vi.fn() };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ updates: [{ id: 'plugin-1' }] }),
    })) as any;

    scheduleRuntimePluginUpdateCheck({
      timers,
      port: 4111,
      eventBus,
      logger,
      fetchImpl,
    });

    expect(timers).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:4111/api/plugins/check-updates',
    );
    expect(eventBus.emit).toHaveBeenCalledWith('plugins:updates-available', {
      count: 1,
      updates: [{ id: 'plugin-1' }],
    });
    expect(logger.info).toHaveBeenCalledWith('Plugin updates available', {
      count: 1,
    });
  });
});
