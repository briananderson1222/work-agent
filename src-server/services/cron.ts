/**
 * Cron utilities — pure functions for 5-field cron matching.
 * Extracted from BuiltinScheduler for reuse across services.
 */

export function parseCronField(
  field: string,
  min: number,
  max: number,
): number[] {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const [rangeStr, stepStr] = part.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;
    if (rangeStr === '*') {
      for (let i = min; i <= max; i += step) values.add(i);
    } else if (rangeStr.includes('-')) {
      const [a, b] = rangeStr.split('-').map(Number);
      for (let i = a; i <= b; i += step) values.add(i);
    } else {
      values.add(parseInt(rangeStr, 10));
    }
  }
  return [...values].sort((a, b) => a - b);
}

export function cronMatches(cron: string, date: Date): boolean {
  const [min, hour, dom, mon, dow] = cron.trim().split(/\s+/);
  const m = date.getUTCMinutes(),
    h = date.getUTCHours();
  const d = date.getUTCDate(),
    mo = date.getUTCMonth() + 1,
    w = date.getUTCDay();
  return (
    parseCronField(min, 0, 59).includes(m) &&
    parseCronField(hour, 0, 23).includes(h) &&
    parseCronField(dom, 1, 31).includes(d) &&
    parseCronField(mon, 1, 12).includes(mo) &&
    parseCronField(dow, 0, 6).includes(w)
  );
}

/** Validate a 5-field cron expression. Returns error string or null if valid. */
export function validateCron(cron: string): string | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return `Expected 5 fields, got ${parts.length}`;
  const ranges: [number, number][] = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 6],
  ];
  for (let i = 0; i < 5; i++) {
    try {
      const vals = parseCronField(parts[i], ranges[i][0], ranges[i][1]);
      if (vals.length === 0) return `Field ${i + 1} produced no values`;
      if (vals.some((v) => v < ranges[i][0] || v > ranges[i][1]))
        return `Field ${i + 1} has values outside ${ranges[i][0]}-${ranges[i][1]}`;
    } catch {
      return `Field ${i + 1} is invalid`;
    }
  }
  return null;
}

export function nextCronTimes(
  cron: string,
  count: number,
  after = new Date(),
): Date[] {
  const results: Date[] = [];
  const cursor = new Date(after);
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  const limit = cursor.getTime() + 366 * 24 * 60 * 60 * 1000;
  while (results.length < count && cursor.getTime() < limit) {
    if (cronMatches(cron, cursor)) results.push(new Date(cursor));
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return results;
}
