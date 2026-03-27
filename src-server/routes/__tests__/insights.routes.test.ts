import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  insightOps: { add: vi.fn() },
}));

const { createInsightsRoutes } = await import('../insights.js');

async function json(res: Response) {
  return res.json();
}

describe('Insights Routes', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'insights-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('GET / returns empty data when no monitoring dir', async () => {
    const app = createInsightsRoutes(join(dir, 'nope'));
    const body = await json(await app.request('/'));
    expect(body.data.totalChats).toBe(0);
    expect(body.data.hourlyActivity).toHaveLength(24);
  });

  test('GET / parses ndjson events', async () => {
    mkdirSync(dir, { recursive: true });
    const now = Date.now();
    const events = [
      JSON.stringify({
        type: 'agent-start',
        agentSlug: 'default',
        timestampMs: now,
      }),
      JSON.stringify({
        type: 'tool-call',
        toolName: 'read_file',
        timestampMs: now,
      }),
      JSON.stringify({
        type: 'agent-complete',
        agentSlug: 'default',
        timestampMs: now,
        usage: { promptTokens: 100, completionTokens: 50, model: 'claude-3' },
      }),
    ];
    writeFileSync(join(dir, 'events-2026-03-23.ndjson'), events.join('\n'));

    const app = createInsightsRoutes(dir);
    const body = await json(await app.request('/?days=1'));
    expect(body.data.totalChats).toBe(1);
    expect(body.data.totalToolCalls).toBe(1);
    expect(body.data.agentUsage.default.chats).toBe(1);
    expect(body.data.modelUsage['claude-3']).toBe(1);
  });
});
