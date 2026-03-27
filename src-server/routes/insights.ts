import { createReadStream, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Hono } from 'hono';
import { insightOps } from '../telemetry/metrics.js';

export function createInsightsRoutes(monitoringDir: string) {
  const app = new Hono();

  app.get('/', async (c) => {
    const days = parseInt(c.req.query('days') || '14', 10);
    insightOps.add(1, { op: 'get_insights' });
    const cutoff = Date.now() - days * 86400000;

    const toolUsage: Record<string, { calls: number; errors: number }> = {};
    const hourlyActivity: number[] = new Array(24).fill(0);
    const agentUsage: Record<string, { chats: number; tokens: number }> = {};
    const modelUsage: Record<string, number> = {};
    let totalChats = 0;
    let totalToolCalls = 0;
    let totalErrors = 0;

    if (!existsSync(monitoringDir))
      return c.json({
        success: true,
        data: {
          toolUsage: {},
          hourlyActivity,
          agentUsage: {},
          modelUsage: {},
          totalChats: 0,
          totalToolCalls: 0,
          totalErrors: 0,
          days,
        },
      });

    const files = await readdir(monitoringDir);
    for (const file of files.filter(
      (f) => f.startsWith('events-') && f.endsWith('.ndjson'),
    )) {
      const stream = createReadStream(join(monitoringDir, file));
      const rl = createInterface({ input: stream, crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          const ts = event.timestampMs || new Date(event.timestamp).getTime();
          if (ts < cutoff) continue;

          const hour = new Date(ts).getHours();
          hourlyActivity[hour]++;

          if (event.type === 'agent-start') {
            totalChats++;
            const agent = event.agentSlug || 'unknown';
            if (!agentUsage[agent]) agentUsage[agent] = { chats: 0, tokens: 0 };
            agentUsage[agent].chats++;
          }
          if (event.type === 'agent-complete') {
            const agent = event.agentSlug || 'unknown';
            if (!agentUsage[agent]) agentUsage[agent] = { chats: 0, tokens: 0 };
            agentUsage[agent].tokens +=
              (event.usage?.promptTokens || 0) +
              (event.usage?.completionTokens || 0);
            if (event.usage?.model)
              modelUsage[event.usage.model] =
                (modelUsage[event.usage.model] || 0) + 1;
          }
          if (event.type === 'tool-call') {
            totalToolCalls++;
            const tool = event.toolName || 'unknown';
            if (!toolUsage[tool]) toolUsage[tool] = { calls: 0, errors: 0 };
            toolUsage[tool].calls++;
          }
          if (event.type === 'tool-result' && event.result?.success === false) {
            totalErrors++;
            const tool = event.toolName || 'unknown';
            if (!toolUsage[tool]) toolUsage[tool] = { calls: 0, errors: 0 };
            toolUsage[tool].errors++;
          }
        } catch (e) {
          console.debug('Failed to parse insights event line:', e);
        }
      }
    }

    return c.json({
      success: true,
      data: {
        toolUsage,
        hourlyActivity,
        agentUsage,
        modelUsage,
        totalChats,
        totalToolCalls,
        totalErrors,
        days,
      },
    });
  });

  return app;
}
