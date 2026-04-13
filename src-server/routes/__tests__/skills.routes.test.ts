import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  skillOps: { add: vi.fn() },
}));

const { createSkillRoutes } = await import('../skills.js');

function setup() {
  const skillService = {
    listSkills: vi
      .fn()
      .mockReturnValue([{ name: 'test-skill', description: 'A test' }]),
    getSkill: vi.fn().mockResolvedValue({
      name: 'test-skill',
      source: 'registry',
      installedAt: '2026-01-01',
      path: '/skills/test-skill',
    }),
    installSkill: vi
      .fn()
      .mockResolvedValue({ success: true, message: 'Installed' }),
    createLocalSkill: vi
      .fn()
      .mockResolvedValue({ success: true, message: 'Created' }),
    updateLocalSkill: vi
      .fn()
      .mockResolvedValue({ success: true, message: 'Updated' }),
    removeSkill: vi
      .fn()
      .mockResolvedValue({ success: true, message: 'Removed' }),
  };
  const getProjectHomeDir = vi.fn().mockReturnValue('/home/test');
  const app = createSkillRoutes(skillService as any, getProjectHomeDir);
  return { app, skillService, getProjectHomeDir };
}

async function json(res: Response) {
  return res.json();
}

describe('Skill Routes', () => {
  test('GET / lists installed skills', async () => {
    const { app } = setup();
    const body = await json(await app.request('/'));
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('test-skill');
  });

  test('GET /:name returns skill detail', async () => {
    const { app } = setup();
    const body = await json(await app.request('/test-skill'));
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('test-skill');
  });

  test('GET /:name returns 404 for unknown skill', async () => {
    const { app, skillService } = setup();
    skillService.getSkill.mockRejectedValue(new Error('not found'));
    const res = await app.request('/unknown');
    expect(res.status).toBe(404);
  });

  test('POST / installs a skill', async () => {
    const { app, skillService } = setup();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'new-skill' }),
    });
    expect(res.status).toBe(201);
    expect(skillService.installSkill).toHaveBeenCalledWith(
      'new-skill',
      '/home/test',
    );
  });

  test('POST / returns 400 on install failure', async () => {
    const { app, skillService } = setup();
    skillService.installSkill.mockResolvedValue({
      success: false,
      message: 'No registry',
    });
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bad-skill' }),
    });
    expect(res.status).toBe(400);
  });

  test('POST /local creates a local skill package', async () => {
    const { app, skillService } = setup();
    const res = await app.request('/local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'local-skill', body: 'Do things' }),
    });
    expect(res.status).toBe(201);
    expect(skillService.createLocalSkill).toHaveBeenCalledWith(
      { name: 'local-skill', body: 'Do things' },
      '/home/test',
    );
  });

  test('PUT /:name updates a local skill package', async () => {
    const { app, skillService } = setup();
    const res = await app.request('/test-skill', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Updated body' }),
    });
    expect(res.status).toBe(200);
    expect(skillService.updateLocalSkill).toHaveBeenCalledWith(
      'test-skill',
      { body: 'Updated body' },
      '/home/test',
    );
  });

  test('DELETE /:name removes a skill', async () => {
    const { app } = setup();
    const body = await json(
      await app.request('/test-skill', { method: 'DELETE' }),
    );
    expect(body.success).toBe(true);
  });

  test('DELETE /:name returns 404 for unknown skill', async () => {
    const { app, skillService } = setup();
    skillService.removeSkill.mockResolvedValue({
      success: false,
      message: 'Not found',
    });
    const res = await app.request('/unknown', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});
