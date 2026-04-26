import { expect, type Page, test } from '@playwright/test';

type SkillRecord = {
  name: string;
  description?: string;
  body: string;
  category?: string;
  tags?: string[];
  agent?: string;
  global?: boolean;
  source?: string;
  path?: string;
  installed?: boolean;
  version?: string;
};

async function seedSkillRoutes(page: Page) {
  const skills = new Map<string, SkillRecord>([
    [
      'Review Skill',
      {
        name: 'Review Skill',
        description: 'Review code changes',
        body: 'Review {{diff}}',
        category: 'quality',
        tags: ['review'],
        global: true,
        source: 'local',
        path: '/tmp/skills/review/SKILL.md',
        installed: true,
      },
    ],
    [
      'Registry Skill',
      {
        name: 'Registry Skill',
        description: 'Installed from registry',
        body: 'Registry managed body',
        source: 'registry',
        path: 'registry://registry-skill',
        installed: true,
        version: '1.0.0',
      },
    ],
  ]);
  const playbooks = new Map<string, { id: string; name: string }>();

  await page.route('**/api/system/skills', async (route) => {
    await route.fulfill({
      json: { success: true, data: Array.from(skills.values()) },
    });
  });

  await page.route('**/api/registry/skills**', async (route) => {
    const request = route.request();
    if (request.method() === 'DELETE') {
      const name = decodeURIComponent(
        new URL(request.url()).pathname.split('/').pop() ?? '',
      );
      skills.delete(name);
      await route.fulfill({ json: { success: true } });
      return;
    }
    await route.fulfill({ json: { success: true, data: [] } });
  });

  await page.route('**/api/skills**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === '/api/skills' && method === 'GET') {
      await route.fulfill({
        json: { success: true, data: Array.from(skills.values()) },
      });
      return;
    }

    if (path === '/api/skills/local' && method === 'POST') {
      const body = request.postDataJSON();
      if (skills.has(body.name)) {
        await route.fulfill({
          status: 409,
          json: {
            success: false,
            error: 'A skill with this name already exists',
          },
        });
        return;
      }
      const skill = {
        ...body,
        source: 'local',
        installed: true,
        path: `/tmp/skills/${body.name}/SKILL.md`,
      };
      skills.set(body.name, skill);
      await route.fulfill({ json: { success: true, data: skill } });
      return;
    }

    const convertMatch = path.match(
      /^\/api\/skills\/([^/]+)\/convert-to-playbook$/,
    );
    if (convertMatch && method === 'POST') {
      const skillName = decodeURIComponent(convertMatch[1]);
      const body = request.postDataJSON();
      const name = body.name || skillName;
      if (name === 'Existing Playbook') {
        await route.fulfill({
          status: 409,
          json: {
            success: false,
            error: 'A playbook with this name already exists',
          },
        });
        return;
      }
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      playbooks.set(id, { id, name });
      await route.fulfill({ json: { success: true, data: { id, name } } });
      return;
    }

    const detailMatch = path.match(/^\/api\/skills\/([^/]+)$/);
    if (detailMatch && method === 'GET') {
      const name = decodeURIComponent(detailMatch[1]);
      await route.fulfill({
        json: { success: true, data: skills.get(name) },
      });
      return;
    }

    if (detailMatch && method === 'PUT') {
      const name = decodeURIComponent(detailMatch[1]);
      const current = skills.get(name);
      const body = request.postDataJSON();
      const updated = { ...current, ...body, name };
      skills.set(name, updated as SkillRecord);
      await route.fulfill({ json: { success: true, data: updated } });
      return;
    }

    await route.fallback();
  });

  await page.route('**/api/playbooks**', async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: Array.from(playbooks.values()).map((playbook) => ({
          ...playbook,
          content: 'Converted body',
          createdAt: '2026-04-26T10:00:00.000Z',
          updatedAt: '2026-04-26T10:00:00.000Z',
          runCount: 0,
          successCount: 0,
          failureCount: 0,
        })),
      },
    });
  });
}

test.describe('Skills (via Registry + API)', () => {
  test('standalone /skills shows installed skills only', async ({ page }) => {
    await page.goto('/skills');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });

    await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: '+ New Skill' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Install' }),
    ).not.toBeVisible();
  });

  test('registry Skills tab loads and is selectable', async ({ page }) => {
    await page.goto('/registry');
    await page.waitForSelector('.page__tab', { timeout: 15_000 });

    await page.locator('.page__tab', { hasText: 'Skills' }).click();

    await expect(page.locator('.page__tab--active')).toHaveText('Skills');
  });

  test('skills API returns list', async ({ page }) => {
    await page.goto('/registry');
    await page.waitForSelector('.page__tab', { timeout: 15_000 });

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/skills');
      return { status: res.status, ok: res.ok };
    });
    expect(response.ok).toBe(true);
  });

  test('skills can be created, guarded, edited, converted, and labeled by source', async ({
    page,
  }) => {
    await seedSkillRoutes(page);
    await page.goto('/skills');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });

    await expect(
      page.locator('.page__tab--active', { hasText: 'Skills' }),
    ).toBeVisible();
    await page.getByRole('button', { name: '+ New Skill' }).click();
    await page.locator('.skill-detail input').nth(0).fill('Planning Skill');
    await page.locator('.skill-detail input').nth(1).fill('Plan a task');
    await page.locator('.skill-detail textarea').fill('Plan {{task}}');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Skill saved')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Planning Skill' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Review Skill' }).click();
    await expect(page.getByText('Source: local')).toBeVisible();
    await expect(page.locator('.skill-detail textarea')).toHaveValue(
      'Review {{diff}}',
    );
    await page
      .locator('.skill-detail input')
      .nth(1)
      .fill('Review code thoroughly');
    await expect(page.getByText('unsaved')).toBeVisible();
    await page.getByRole('button', { name: 'Open Playbooks' }).click();
    await expect(page.getByRole('dialog')).toContainText('Discard them?');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/skills\/Review%20Skill/);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Skill saved')).toBeVisible();

    await page.getByRole('button', { name: 'Create Playbook' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Create Playbook From Skill' }),
    ).toBeVisible();
    await page.getByRole('dialog').locator('input').fill('Existing Playbook');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Create Playbook' })
      .click();
    await expect(
      page.getByText('A playbook with this name already exists'),
    ).toBeVisible();
    await page.getByRole('dialog').locator('input').fill('Review Playbook');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Create Playbook' })
      .click();
    await expect(page.getByText('Playbook created')).toBeVisible();
    await expect(page).toHaveURL(/\/playbooks\/review-playbook/);

    await page.goto('/skills');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Registry Skill' }).click();
    await expect(page.getByText('Source: registry')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).not.toBeVisible();
    await expect(page.locator('.skill-detail textarea')).toBeDisabled();
  });
});
