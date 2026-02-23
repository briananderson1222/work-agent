/**
 * Scheduler Routes - boo scheduled job management
 */

import { Hono } from 'hono';
import type { SchedulerService } from '../services/scheduler-service.js';

export function createSchedulerRoutes(schedulerService: SchedulerService, logger: any) {
  const app = new Hono();

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

  app.get('/jobs/:target/logs', async (c) => {
    try {
      const count = parseInt(c.req.query('count') || '20', 10);
      const data = await schedulerService.getJobLogs(c.req.param('target'), count);
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

  return app;
}
