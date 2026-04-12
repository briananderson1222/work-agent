import { createReadStream, existsSync } from 'node:fs';
import { appendFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

interface RuntimeLogger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

export class RuntimeEventLog {
  constructor(
    private readonly eventLogPath: string,
    private readonly logger: RuntimeLogger,
  ) {}

  get directory(): string {
    return this.eventLogPath;
  }

  async queryEvents(
    start: number,
    end: number,
    userId: string,
  ): Promise<any[]> {
    const events: any[] = [];

    try {
      const eventFiles = await readdir(this.eventLogPath);
      const logFiles = eventFiles.filter(
        (file) => file.startsWith('events-') && file.endsWith('.ndjson'),
      );

      for (const file of logFiles) {
        const filePath = join(this.eventLogPath, file);
        const fileStream = createReadStream(filePath);
        const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

        for await (const line of rl) {
          if (!line.trim()) {
            continue;
          }
          try {
            const event = JSON.parse(line);
            const eventTime = new Date(event.timestamp).getTime();

            if (
              eventTime >= start &&
              eventTime <= end &&
              (event.userId === userId || event['stallion.user.id'] === userId)
            ) {
              events.push(event);
            }
          } catch (error) {
            this.logger.warn('Failed to parse event line', {
              line,
              error,
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to query events from disk', {
        error,
        start,
        end,
      });
    }

    return events;
  }

  async loadRecentEvents(): Promise<void> {
    try {
      if (!existsSync(this.eventLogPath)) {
        await mkdir(this.eventLogPath, { recursive: true });
        this.logger.debug('Created monitoring directory', {
          path: this.eventLogPath,
        });
        return;
      }

      const files = await readdir(this.eventLogPath);
      const eventFiles = files
        .filter(
          (file) => file.startsWith('events-') && file.endsWith('.ndjson'),
        )
        .sort()
        .reverse()
        .slice(0, 2);

      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      let recentEventCount = 0;

      for (const file of eventFiles) {
        const filePath = join(this.eventLogPath, file);
        const fileStream = createReadStream(filePath);
        const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

        for await (const line of rl) {
          if (!line.trim()) {
            continue;
          }
          try {
            const event = JSON.parse(line);
            const eventTime = new Date(event.timestamp).getTime();

            if (eventTime >= oneDayAgo) {
              recentEventCount++;
            }
          } catch (error) {
            this.logger.warn('Failed to parse event line', {
              line,
              error,
            });
          }
        }
      }

      this.logger.info('Loaded persisted events', {
        count: recentEventCount,
      });
    } catch (error) {
      this.logger.error('Failed to load events from disk', { error });
    }
  }

  async persist(event: any): Promise<void> {
    try {
      if (!existsSync(this.eventLogPath)) {
        await mkdir(this.eventLogPath, { recursive: true });
      }

      const logPath = this.getTodayEventLogPath();
      await appendFile(logPath, `${JSON.stringify(event)}\n`, 'utf-8');
    } catch (error) {
      this.logger.error('Failed to persist event', { error, event });
    }
  }

  private getTodayEventLogPath(): string {
    const today = new Date().toISOString().split('T')[0];
    return join(this.eventLogPath, `events-${today}.ndjson`);
  }
}
