import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  agentOps: { add: vi.fn() },
}));

const { createAgentRoutes } = await import('../agents.js');

function setup() {
  const agentService = {
    getEnrichedAgents: vi.fn().mockResolvedValue([{ slug: 'default', name: 'Default' }]),
    createAgent: vi.fn().mockResolvedValue({ slug: 'new', spec: { name: 'New' } }),
    updateAgent: vi.fn().mockResolvedValue({ name: 'Updated' }),
    deleteAgent: vi.fn().mockResolvedValue({ success: true }),
  };
  const reinitialize = vi.fn().mockResolvedValue(undefined);
  const getVoltAgent = vi.fn().mockReturnValue({ getAgents: vi.fn().mockResolvedValue([{ id: 'default' }]) });
  const app = createAgentRoutes(agentService as any, reinitialize, getVoltAgent);
  return { app, agentService, reinitialize, getVoltAgent };
}

async function json(res: Response) { return res.json(); }

describe('Agent Routes', () => {
  test('GET / returns enriched agents', async () => {
    const { app } = setup();
    const body = await json(await app.request('/'));
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('GET / returns 500 when voltAgent not initialized', async () => {
    const { app, getVoltAgent } = setup();
    getVoltAgent.mockReturnValue(null);
    const res = await app.request('/');
    expect(res.status).toBe(500);
  });

  test('POST / creates agent and reinitializes', async () => {
    const { app, reinitialize } = setup();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New', prompt: 'test' }),
    });
    expect(res.status).toBe(201);
    expect(reinitialize).toHaveBeenCalled();
  });

  test('PUT /:slug updates agent', async () => {
    const { app } = setup();
    const body = await json(await app.request('/default', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    }));
    expect(body.success).toBe(true);
  });

  test('DELETE /:slug deletes agent', async () => {
    const { app } = setup();
    const body = await json(await app.request('/default', { method: 'DELETE' }));
    expect(body.success).toBe(true);
  });

  test('DELETE /:slug returns 400 when agent has dependents', async () => {
    const { app, agentService } = setup();
    agentService.deleteAgent.mockResolvedValue({ success: false, error: 'Referenced by layouts' });
    const res = await app.request('/default', { method: 'DELETE' });
    expect(res.status).toBe(400);
  });
});
