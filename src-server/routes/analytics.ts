/**
 * Analytics Routes - usage stats and achievements
 */

import { Hono } from 'hono';
import type { UsageAggregator } from '../analytics/usage-aggregator.js';

export function createAnalyticsRoutes(
  usageAggregator: UsageAggregator | undefined,
) {
  const app = new Hono();

  app.get('/usage', async (c) => {
    try {
      if (!usageAggregator) {
        return c.json(
          { success: false, error: 'Analytics not initialized' },
          500,
        );
      }
      const stats = await usageAggregator.loadStats();
      const from = c.req.query('from');
      const to = c.req.query('to');
      if (from || to) {
        const defaultFrom = new Date(Date.now() - 14 * 86400000)
          .toISOString()
          .split('T')[0];
        const defaultTo = new Date().toISOString().split('T')[0];
        const f = from || defaultFrom;
        const t = to || defaultTo;
        const filtered: typeof stats.byDate = {};
        for (const [date, day] of Object.entries(stats.byDate || {})) {
          if (date >= f && date <= t) filtered[date] = day;
        }
        // Compute range summary
        const days = Object.values(filtered);
        const totalDays = Math.max(
          1,
          Math.round(
            (new Date(t).getTime() - new Date(f).getTime()) / 86400000,
          ) + 1,
        );
        const activeDays = days.length;
        const totalMessages = days.reduce((s, d) => s + d.messages, 0);
        const totalCost = days.reduce((s, d) => s + d.cost, 0);
        const avgPerDay = activeDays > 0 ? totalMessages / activeDays : 0;
        const rangeSummary = {
          totalDays,
          activeDays,
          totalMessages,
          totalCost,
          avgPerDay,
        };
        return c.json({ data: { ...stats, byDate: filtered, rangeSummary } });
      }
      return c.json({ data: stats });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.get('/achievements', async (c) => {
    try {
      if (!usageAggregator) {
        return c.json(
          { success: false, error: 'Analytics not initialized' },
          500,
        );
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
        return c.json(
          { success: false, error: 'Analytics not initialized' },
          500,
        );
      }
      const stats = await usageAggregator.fullRescan();
      return c.json({ data: stats, message: 'Full rescan completed' });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  app.delete('/usage', async (c) => {
    try {
      if (!usageAggregator) {
        return c.json(
          { success: false, error: 'Analytics not initialized' },
          500,
        );
      }
      await usageAggregator.reset();
      return c.json({ success: true, message: 'Usage stats reset' });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  return app;
}

// Legacy default export for backward compatibility
import { join } from 'node:path';
import { UsageAggregator as UA } from '../analytics/usage-aggregator.js';

const projectHomeDir =
  process.env.STALLION_AI_DIR || join(process.cwd(), '.stallion-ai');
const aggregator = new UA(projectHomeDir);

export default createAnalyticsRoutes(aggregator);
