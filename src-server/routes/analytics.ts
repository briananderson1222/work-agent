import { Hono } from 'hono';
import { UsageAggregator } from '../analytics/usage-aggregator.js';
import { join } from 'path';

const app = new Hono();

const workAgentDir = process.env.WORK_AGENT_DIR || join(process.cwd(), '.work-agent');
const aggregator = new UsageAggregator(workAgentDir);

app.get('/usage', async (c) => {
  try {
    const stats = await aggregator.loadStats();
    return c.json({ data: stats });
  } catch (error: any) {
    console.error('Error loading usage stats:', error);
    return c.json({ error: error.message }, 500);
  }
});

app.get('/achievements', async (c) => {
  try {
    const achievements = await aggregator.getAchievements();
    return c.json({ data: achievements });
  } catch (error: any) {
    console.error('Error loading achievements:', error);
    return c.json({ error: error.message }, 500);
  }
});

app.post('/rescan', async (c) => {
  try {
    const stats = await aggregator.fullRescan();
    return c.json({ data: stats, message: 'Full rescan completed' });
  } catch (error: any) {
    console.error('Error rescanning usage:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;
