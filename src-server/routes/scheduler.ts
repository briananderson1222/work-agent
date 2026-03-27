/**
 * Scheduler Routes — scheduled job management
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { SchedulerService } from '../services/scheduler-service.js';
import { schedulerJobRuns } from '../telemetry/metrics.js';
import type { Logger } from '../utils/logger.js';
import {
  addJobSchema,
  editJobSchema,
  errorMessage,
  getBody,
  param,
  runOutputSchema,
  schedulerOpenSchema,
  validate,
} from './schemas.js';

export function createSchedulerRoutes(
  schedulerService: SchedulerService,
  logger: Logger,
) {
  const app = new Hono();

  // List registered scheduler providers (for UI dropdown)
  app.get('/providers', (c) => {
    return c.json({ success: true, data: schedulerService.listProviders() });
  });

  // SSE endpoint for real-time job events
  app.get('/events', (c) => {
    return streamSSE(c, async (stream) => {
      const unsub = schedulerService.subscribe((data) => {
        stream
          .writeSSE({ data })
          .catch((e) => logger.error('SSE write failed', { error: e }));
      });
      // Keep alive
      const keepAlive = setInterval(() => {
        stream
          .writeSSE({ event: 'ping', data: '' })
          .catch((e) => logger.error('SSE ping failed', { error: e }));
      }, 30_000);
      // Wait until client disconnects
      try {
        await new Promise((_, reject) => {
          stream.onAbort(() => reject(new Error('aborted')));
        });
      } catch (e) {
        logger.debug('SSE client disconnected', { error: e });
        /* client disconnected */
      }
      clearInterval(keepAlive);
      unsub();
    });
  });

  // Webhook receiver (from scheduler provider)
  app.post('/webhook', async (c) => {
    try {
      const event = await c.req.json();
      logger.info('Scheduler webhook event', { event });
      schedulerService.broadcast(event);
      return c.json({ success: true });
    } catch (error: unknown) {
      logger.error('Webhook parse error', { error });
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  app.get('/jobs', async (c) => {
    try {
      const data = await schedulerService.listJobs();
      return c.json({ success: true, data });
    } catch (error: unknown) {
      logger.error('Failed to list scheduler jobs', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.get('/stats', async (c) => {
    try {
      const data = await schedulerService.getStats();
      return c.json({ success: true, data });
    } catch (error: unknown) {
      logger.error('Failed to get scheduler stats', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.get('/status', async (c) => {
    try {
      const data = await schedulerService.getStatus();
      return c.json({ success: true, data });
    } catch (error: unknown) {
      logger.error('Failed to get scheduler status', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.get('/jobs/preview-schedule', async (c) => {
    try {
      const cron = c.req.query('cron');
      if (!cron)
        return c.json({ success: false, error: 'cron is required' }, 400);
      const count = parseInt(c.req.query('count') || '5', 10);
      const data = await schedulerService.previewSchedule(cron, count);
      return c.json({ success: true, data });
    } catch (error: unknown) {
      logger.error('Failed to preview schedule', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.get('/jobs/:target/logs', async (c) => {
    try {
      const count = parseInt(c.req.query('count') || '20', 10);
      const data = await schedulerService.getJobLogs(param(c, 'target'), count);
      return c.json({ success: true, data });
    } catch (error: unknown) {
      logger.error('Failed to get job logs', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Read a run's output content by its log path
  app.post('/runs/output', validate(runOutputSchema), async (c) => {
    try {
      const { path } = getBody(c);
      const content = await schedulerService.readRunFile(path);
      return c.json({ success: true, data: { content } });
    } catch (error: unknown) {
      logger.error('Failed to read run output', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.post('/jobs', validate(addJobSchema), async (c) => {
    try {
      const body = getBody(c);
      schedulerJobRuns.add(1, { op: 'create_job' });
      const output = await schedulerService.addJob(body);
      return c.json({ success: true, data: { output } });
    } catch (error: unknown) {
      logger.error('Failed to add job', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.put('/jobs/:target', validate(editJobSchema), async (c) => {
    try {
      const opts = getBody(c);
      schedulerJobRuns.add(1, { op: 'edit_job' });
      const output = await schedulerService.editJob(param(c, 'target'), opts);
      return c.json({ success: true, data: { output } });
    } catch (error: unknown) {
      logger.error('Failed to edit job', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.post('/jobs/:target/run', async (c) => {
    const target = param(c, 'target');
    try {
      schedulerJobRuns.add(1, { op: 'run_job' });
      const output = await schedulerService.runJob(target);
      return c.json({ success: true, data: { output } });
    } catch (error: unknown) {
      logger.error('Failed to run job', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.put('/jobs/:target/enable', async (c) => {
    try {
      schedulerJobRuns.add(1, { op: 'enable_job' });
      await schedulerService.enableJob(param(c, 'target'));
      return c.json({ success: true });
    } catch (error: unknown) {
      logger.error('Failed to enable job', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.put('/jobs/:target/disable', async (c) => {
    try {
      schedulerJobRuns.add(1, { op: 'disable_job' });
      await schedulerService.disableJob(param(c, 'target'));
      return c.json({ success: true });
    } catch (error: unknown) {
      logger.error('Failed to disable job', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.delete('/jobs/:target', async (c) => {
    try {
      schedulerJobRuns.add(1, { op: 'delete_job' });
      await schedulerService.removeJob(param(c, 'target'));
      return c.json({ success: true });
    } catch (error: unknown) {
      logger.error('Failed to remove job', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Open a file with the system default handler (restricted to scheduler logs)
  app.post('/open', validate(schedulerOpenSchema), async (c) => {
    try {
      const { path: filePath } = getBody(c);
      const { realpathSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { resolveHomeDir } = await import('../utils/paths.js');
      const real = realpathSync(filePath);
      const logsDir = realpathSync(join(resolveHomeDir(), 'scheduler', 'logs'));
      if (!real.startsWith(logsDir)) {
        return c.json(
          { success: false, error: 'Path outside scheduler logs' },
          403,
        );
      }
      const { execFile } = await import('node:child_process');
      const cmd =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'start'
            : 'xdg-open';
      execFile(cmd, [real], { windowsHide: true }, (err) => {
        if (err) logger.error('Failed to open file', { error: err });
      });
      return c.json({ success: true });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  return app;
}
