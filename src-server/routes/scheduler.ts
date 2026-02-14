/**
 * Scheduler Routes - CRUD for scheduled jobs, history, and upcoming runs
 */

import { Hono } from 'hono';
import type { SchedulerService } from '../scheduler/index.js';

export function createSchedulerRoutes(scheduler: SchedulerService) {
  const app = new Hono();

  // List all jobs
  app.get('/jobs', (c) => {
    try {
      const jobs = scheduler.getJobs();
      return c.json({ success: true, data: jobs });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Get single job
  app.get('/jobs/:id', (c) => {
    try {
      const job = scheduler.getJob(c.req.param('id'));
      if (!job) return c.json({ success: false, error: 'Job not found' }, 404);
      return c.json({ success: true, data: job });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Create new job
  app.post('/jobs', async (c) => {
    try {
      const body = await c.req.json();
      const { name, description, enabled, schedule, action } = body;

      if (!name || !schedule || !action) {
        return c.json({ success: false, error: 'name, schedule, and action are required' }, 400);
      }

      const job = await scheduler.addJob({ name, description, enabled, schedule, action });
      return c.json({ success: true, data: job }, 201);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Update job
  app.put('/jobs/:id', async (c) => {
    try {
      const body = await c.req.json();
      const job = await scheduler.updateJob(c.req.param('id'), body);
      if (!job) return c.json({ success: false, error: 'Job not found' }, 404);
      return c.json({ success: true, data: job });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Delete job
  app.delete('/jobs/:id', async (c) => {
    try {
      const deleted = await scheduler.removeJob(c.req.param('id'));
      if (!deleted) return c.json({ success: false, error: 'Job not found' }, 404);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Enable job
  app.post('/jobs/:id/enable', async (c) => {
    try {
      const job = await scheduler.enableJob(c.req.param('id'));
      if (!job) return c.json({ success: false, error: 'Job not found' }, 404);
      return c.json({ success: true, data: job });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Disable job
  app.post('/jobs/:id/disable', async (c) => {
    try {
      const job = await scheduler.disableJob(c.req.param('id'));
      if (!job) return c.json({ success: false, error: 'Job not found' }, 404);
      return c.json({ success: true, data: job });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Run job immediately
  app.post('/jobs/:id/run', async (c) => {
    try {
      const execution = await scheduler.runJobNow(c.req.param('id'));
      if (!execution) return c.json({ success: false, error: 'Job not found' }, 404);
      return c.json({ success: true, data: execution });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Get upcoming scheduled runs
  app.get('/upcoming', (c) => {
    try {
      const limit = parseInt(c.req.query('limit') || '5');
      const upcoming = scheduler.getUpcoming(limit);
      return c.json({ success: true, data: upcoming });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Get execution history
  app.get('/history', async (c) => {
    try {
      const jobId = c.req.query('jobId') || undefined;
      const startDate = c.req.query('startDate') || undefined;
      const endDate = c.req.query('endDate') || undefined;
      const limit = parseInt(c.req.query('limit') || '50');

      const history = await scheduler.getHistory({ jobId, startDate, endDate, limit });
      return c.json({ success: true, data: history });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Get history for specific job
  app.get('/history/:jobId', async (c) => {
    try {
      const jobId = c.req.param('jobId');
      const limit = parseInt(c.req.query('limit') || '50');

      const history = await scheduler.getHistory({ jobId, limit });
      return c.json({ success: true, data: history });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  return app;
}
