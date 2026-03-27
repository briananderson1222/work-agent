import { describe, expect, test } from 'vitest';
import { cronMatches, nextCronTimes, parseCronField } from '../cron.js';

describe('parseCronField', () => {
  test('wildcard expands full range', () => {
    expect(parseCronField('*', 0, 5)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('step value', () => {
    expect(parseCronField('*/2', 0, 6)).toEqual([0, 2, 4, 6]);
  });

  test('range', () => {
    expect(parseCronField('2-5', 0, 10)).toEqual([2, 3, 4, 5]);
  });

  test('comma-separated', () => {
    expect(parseCronField('1,3,5', 0, 10)).toEqual([1, 3, 5]);
  });

  test('range with step', () => {
    expect(parseCronField('0-10/3', 0, 10)).toEqual([0, 3, 6, 9]);
  });
});

describe('cronMatches', () => {
  test('matches exact minute and hour', () => {
    const d = new Date('2026-01-15T09:30:00Z');
    expect(cronMatches('30 9 * * *', d)).toBe(true);
  });

  test('rejects non-matching minute', () => {
    const d = new Date('2026-01-15T09:31:00Z');
    expect(cronMatches('30 9 * * *', d)).toBe(false);
  });

  test('matches day of week', () => {
    // 2026-01-05 is Monday (dow=1)
    const d = new Date('2026-01-05T00:00:00Z');
    expect(cronMatches('0 0 * * 1', d)).toBe(true);
    expect(cronMatches('0 0 * * 2', d)).toBe(false);
  });
});

describe('nextCronTimes', () => {
  test('returns requested count', () => {
    const after = new Date('2026-01-01T00:00:00Z');
    const times = nextCronTimes('0 * * * *', 3, after);
    expect(times).toHaveLength(3);
  });

  test('times are in ascending order', () => {
    const after = new Date('2026-01-01T00:00:00Z');
    const times = nextCronTimes('*/15 * * * *', 4, after);
    for (let i = 1; i < times.length; i++) {
      expect(times[i].getTime()).toBeGreaterThan(times[i - 1].getTime());
    }
  });

  test('returns empty for impossible cron', () => {
    const after = new Date('2026-01-01T00:00:00Z');
    expect(nextCronTimes('0 0 31 2 *', 1, after)).toHaveLength(0);
  });
});
