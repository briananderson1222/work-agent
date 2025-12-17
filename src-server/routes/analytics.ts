/**
 * Analytics Routes - usage stats and achievements
 */

import { Hono } from 'hono';
import type { UsageAggregator } from '../analytics/usage-aggregator.js';

export function createAnalyticsRoutes(usageAggregator: UsageAggregator | undefined) {
  const app = new Hono();

  app.get('/usage', async (c) => {
    try {
      if (!usageAggregator) {
        return c.json({ success: false, error: 'Analytics not initialized' }, 500);
      }
      const stats = await usageAggregator.loadStats();
      return c.json({ data: stats });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.get('/achievements', async (c) => {
    try {
      if (!usageAggregator) {
        return c.json({ success: false, error: 'Analytics not initialized' }, 500);
      }
      const achievements = await usageAggregator.getAchievements();
      return c.json({ data: achievements });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.post('/rescan', async (c) => {
    try {
      if (!usageAggregator) {
        return c.json({ success: false, error: 'Analytics not initialized' }, 500);
      }
      const stats = await usageAggregator.fullRescan();
      return c.json({ data: stats, message: 'Full rescan completed' });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  return app;
}

// Legacy default export for backward compatibility
import { join } from 'path';
import { UsageAggregator as UA } from '../analytics/usage-aggregator.js';

const workAgentDir = process.env.WORK_AGENT_DIR || join(process.cwd(), '.work-agent');
const aggregator = new UA(workAgentDir);

export default createAnalyticsRoutes(aggregator);
