import { describe, expect, test, vi } from 'vitest';
import { createRunRoutes } from '../runs.js';

const logger = { error: vi.fn() };

describe('Run Routes', () => {
  test('GET / lists mixed-source runs through a neutral read surface', async () => {
    const service = {
      listRuns: vi.fn().mockResolvedValue([
        {
          runId: 'orchestration:codex:thread-1',
          providerId: 'codex',
          source: 'orchestration',
          sourceId: 'thread-1',
          status: 'completed',
          startedAt: '2026-04-25T12:00:00.000Z',
          updatedAt: '2026-04-25T12:00:03.000Z',
          retryEligible: false,
          attempt: 1,
        },
        {
          runId: 'schedule:built-in:daily:daily-1',
          providerId: 'built-in',
          source: 'schedule',
          sourceId: 'daily',
          status: 'failed',
          startedAt: '2026-04-25T12:00:00.000Z',
          updatedAt: '2026-04-25T12:00:03.000Z',
          retryEligible: true,
          attempt: 1,
        },
      ]),
      readRun: vi.fn(),
      readOutput: vi.fn(),
    };
    const app = createRunRoutes(service as any, logger as any);

    const res = await app.request('/?source=schedule&providerId=built-in');
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(service.listRuns).toHaveBeenCalledWith({
      source: 'schedule',
      providerId: 'built-in',
      sourceId: undefined,
    });
  });

  test('GET /:runId reads a run by source-qualified id', async () => {
    const service = {
      listRuns: vi.fn(),
      readRun: vi.fn().mockResolvedValue({
        runId: 'schedule:built-in:daily:daily-1',
        providerId: 'built-in',
        source: 'schedule',
        sourceId: 'daily',
        status: 'completed',
        startedAt: '2026-04-25T12:00:00.000Z',
        updatedAt: '2026-04-25T12:00:03.000Z',
        retryEligible: false,
        attempt: 1,
      }),
      readOutput: vi.fn(),
    };
    const app = createRunRoutes(service as any, logger as any);

    const res = await app.request('/schedule:built-in:daily:daily-1');
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      runId: 'schedule:built-in:daily:daily-1',
      source: 'schedule',
    });
  });

  test('POST /output resolves opaque output references through the service bridge', async () => {
    const service = {
      listRuns: vi.fn(),
      readRun: vi.fn(),
      readOutput: vi.fn().mockResolvedValue('run output'),
    };
    const app = createRunRoutes(service as any, logger as any);

    const ref = {
      source: 'schedule',
      providerId: 'built-in',
      runId: 'schedule:built-in:daily:daily-1',
      artifactId: 'daily-1',
      kind: 'output',
    };
    const res = await app.request('/output', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ref),
    });
    const body = await res.json();

    expect(body).toEqual({ success: true, data: { content: 'run output' } });
    expect(service.readOutput).toHaveBeenCalledWith(ref);
  });

  test('does not expose mutation routes', async () => {
    const app = createRunRoutes(
      { listRuns: vi.fn(), readRun: vi.fn(), readOutput: vi.fn() } as any,
      logger as any,
    );

    expect((await app.request('/', { method: 'POST' })).status).toBe(404);
    expect(
      (
        await app.request('/schedule:built-in:daily:daily-1', {
          method: 'DELETE',
        })
      ).status,
    ).toBe(404);
  });
});
