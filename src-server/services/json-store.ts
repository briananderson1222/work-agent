/**
 * JsonFileStore — typed JSON file persistence.
 * Shared by BuiltinScheduler (jobs/logs) and NotificationService (notifications).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class JsonFileStore<T> {
  constructor(
    private filePath: string,
    private fallback: T,
  ) {}

  read(): T {
    if (!existsSync(this.filePath)) return structuredClone(this.fallback);
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf-8'));
    } catch (e) {
      console.debug(
        'Failed to read JSON store file, using fallback:',
        this.filePath,
        e,
      );
      return structuredClone(this.fallback);
    }
  }

  write(data: T): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  /** For array-typed stores: append an entry, keeping the last `max` entries. */
  append<U>(this: JsonFileStore<U[]>, entry: U, max = 100): void {
    const data = this.read();
    data.push(entry);
    this.write(max > 0 ? data.slice(-max) : data);
  }
}
