/**
 * Scheduler Routes - boo scheduled job management
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { SchedulerService } from '../services/scheduler-service.js';

export function createSchedulerRoutes(
  schedulerService: SchedulerService,
  logger: any,
) {
  const app = new Hono();

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
      } catch {
        /* client disconnected */
      }
      clearInterval(keepAlive);
      unsub();
    });
  });

  // Webhook receiver (from boo)
  app.post('/webhook', async (c) => {
    try {
      const event = await c.req.json();
      logger.info('Scheduler webhook event', { event });
      schedulerService.broadcast(event);
      return c.json({ success: true });
    } catch (error: any) {
      logger.error('Webhook parse error', { error });
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  app.get('/jobs', async (c) => {
    try {
      const data = await schedulerService.listJobs();
      return c.json({ success: true, data });
    } catch (error: any) {
      logger.error('Failed to list scheduler jobs', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.get('/stats', async (c) => {
    try {
      const data = await schedulerService.getStats();
      return c.json({ success: true, data });
    } catch (error: any) {
      logger.error('Failed to get scheduler stats', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.get('/stats/:target', async (c) => {
    try {
      const data = await schedulerService.getStats(c.req.param('target'));
      return c.json({ success: true, data });
    } catch (error: any) {
      logger.error('Failed to get job stats', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.get('/status', async (c) => {
    try {
      const data = await schedulerService.getStatus();
      return c.json({ success: true, data });
    } catch (error: any) {
      logger.error('Failed to get scheduler status', { error });
      return c.json({ success: false, error: error.message }, 500);
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
    } catch (error: any) {
      logger.error('Failed to preview schedule', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.get('/jobs/:target/logs', async (c) => {
    try {
      const count = parseInt(c.req.query('count') || '20', 10);
      const data = await schedulerService.getJobLogs(
        c.req.param('target'),
        count,
      );
      return c.json({ success: true, data });
    } catch (error: any) {
      logger.error('Failed to get job logs', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Read a run's output content by its log path
  app.post('/runs/output', async (c) => {
    try {
      const { path } = await c.req.json();
      const content = await schedulerService.readRunFile(path);
      return c.json({ success: true, data: { content } });
    } catch (error: any) {
      logger.error('Failed to read run output', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.post('/jobs', async (c) => {
    try {
      const body = await c.req.json();
      const output = await schedulerService.addJob(body);
      return c.json({ success: true, data: { output } });
    } catch (error: any) {
      logger.error('Failed to add job', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.put('/jobs/:target', async (c) => {
    try {
      const opts = await c.req.json();
      const output = await schedulerService.editJob(
        c.req.param('target'),
        opts,
      );
      return c.json({ success: true, data: { output } });
    } catch (error: any) {
      logger.error('Failed to edit job', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.post('/jobs/:target/run', async (c) => {
    try {
      const output = await schedulerService.runJob(c.req.param('target'));
      return c.json({ success: true, data: { output } });
    } catch (error: any) {
      logger.error('Failed to run job', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.put('/jobs/:target/enable', async (c) => {
    try {
      await schedulerService.enableJob(c.req.param('target'));
      return c.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to enable job', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.put('/jobs/:target/disable', async (c) => {
    try {
      await schedulerService.disableJob(c.req.param('target'));
      return c.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to disable job', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.delete('/jobs/:target', async (c) => {
    try {
      await schedulerService.removeJob(c.req.param('target'));
      return c.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to remove job', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Open a file with the system default handler
  app.post('/open', async (c) => {
    try {
      const { path: filePath } = await c.req.json();
      if (!filePath || typeof filePath !== 'string') {
        return c.json({ success: false, error: 'path required' }, 400);
      }
      const { execFile } = await import('node:child_process');
      const cmd =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'start'
            : 'xdg-open';
      execFile(cmd, [filePath], (err) => {
        if (err) logger.error('Failed to open file', { error: err });
      });
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  return app;
}
