import { expect, type Page, test } from '@playwright/test';

type PlaybookRecord = {
  id: string;
  name: string;
  content: string;
  description?: string;
  category?: string;
  tags?: string[];
  agent?: string;
  global?: boolean;
  storageMode?: 'json-inline' | 'markdown-file';
  createdAt: string;
  updatedAt: string;
  runCount: number;
  successCount: number;
  failureCount: number;
  provenance?: {
    source: string;
    sourceName?: string;
  };
};

function makePlaybook(
  overrides: Partial<PlaybookRecord> & Pick<PlaybookRecord, 'id' | 'name'>,
): PlaybookRecord {
  return {
    content: 'Draft a plan for {{topic}}',
    createdAt: '2026-04-26T10:00:00.000Z',
    updatedAt: '2026-04-26T10:00:00.000Z',
    runCount: 0,
    successCount: 0,
    failureCount: 0,
    provenance: { source: 'local' },
    ...overrides,
  };
}

async function seedPlaybookRoutes(page: Page) {
  const playbooks = new Map<string, PlaybookRecord>([
    [
      'release-plan',
      makePlaybook({
        id: 'release-plan',
        name: 'Release Plan',
        description: 'Coordinate a launch',
        category: 'delivery',
        tags: ['release', 'planning'],
        agent: 'codex',
        global: true,
      }),
    ],
    [
      'research-brief',
      makePlaybook({
        id: 'research-brief',
        name: 'Research Brief',
        description: 'Gather evidence',
        category: 'research',
      }),
    ],
  ]);
  const agents = [{ slug: 'codex', name: 'Codex' }];
  const existingSkills = new Set(['Release Skill']);

  await page.route('**/api/agents', async (route) => {
    await route.fulfill({ json: { success: true, data: agents } });
  });

  await page.route('**/api/playbooks**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === '/api/playbooks' && method === 'GET') {
      await route.fulfill({
        json: { success: true, data: Array.from(playbooks.values()) },
      });
      return;
    }

    if (path === '/api/playbooks' && method === 'POST') {
      const body = request.postDataJSON();
      if (
        Array.from(playbooks.values()).some(
          (playbook) => playbook.name === body.name,
        )
      ) {
        await route.fulfill({
          status: 409,
          json: {
            success: false,
            error: 'A playbook with this name already exists',
          },
        });
        return;
      }
      const id = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const playbook = makePlaybook({
        id,
        name: body.name,
        content: body.content,
        description: body.description,
        category: body.category,
        tags: body.tags,
        agent: body.agent,
        global: body.global,
        storageMode: body.storageMode,
      });
      playbooks.set(id, playbook);
      await route.fulfill({ json: { success: true, data: playbook } });
      return;
    }

    const convertMatch = path.match(
      /^\/api\/playbooks\/([^/]+)\/convert-to-skill$/,
    );
    if (convertMatch && method === 'POST') {
      const body = request.postDataJSON();
      const name = body.name || playbooks.get(convertMatch[1])?.name;
      if (existingSkills.has(name)) {
        await route.fulfill({
          status: 409,
          json: {
            success: false,
            error: 'A skill with this name already exists',
          },
        });
        return;
      }
      existingSkills.add(name);
      await route.fulfill({
        json: { success: true, data: { name, source: 'local' } },
      });
      return;
    }

    const runMatch = path.match(/^\/api\/playbooks\/([^/]+)\/run$/);
    if (runMatch && method === 'POST') {
      const id = decodeURIComponent(runMatch[1]);
      const current = playbooks.get(id);
      if (!current) {
        await route.fulfill({ status: 404, json: { success: false } });
        return;
      }
      current.runCount += 1;
      await route.fulfill({ json: { success: true, data: current } });
      return;
    }

    const outcomeMatch = path.match(/^\/api\/playbooks\/([^/]+)\/outcome$/);
    if (outcomeMatch && method === 'POST') {
      const id = decodeURIComponent(outcomeMatch[1]);
      const current = playbooks.get(id);
      if (!current) {
        await route.fulfill({ status: 404, json: { success: false } });
        return;
      }
      current.successCount += 1;
      await route.fulfill({ json: { success: true, data: current } });
      return;
    }

    const idMatch = path.match(/^\/api\/playbooks\/([^/]+)$/);
    if (idMatch && method === 'PUT') {
      const id = decodeURIComponent(idMatch[1]);
      const current = playbooks.get(id);
      if (!current) {
        await route.fulfill({ status: 404, json: { success: false } });
        return;
      }
      const body = request.postDataJSON();
      const updated = {
        ...current,
        ...body,
        id,
        updatedAt: '2026-04-26T11:00:00.000Z',
      };
      playbooks.set(id, updated);
      await route.fulfill({ json: { success: true, data: updated } });
      return;
    }

    if (idMatch && method === 'DELETE') {
      playbooks.delete(decodeURIComponent(idMatch[1]));
      await route.fulfill({ json: { success: true } });
      return;
    }

    await route.fallback();
  });
}

test.describe('Playbooks (formerly Prompts)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.title.includes('guidance playbooks cover')) {
      return;
    }
    await page.goto('/playbooks');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });
  });

  test('playbooks page loads', async ({ page }) => {
    await expect(page.locator('.split-pane')).toBeVisible();
  });

  test('/api/playbooks endpoint works', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const apiBase = (window as any).__API_BASE__ || '';
      const r = await fetch(`${apiBase}/api/playbooks`);
      return r.json();
    });
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
  });

  test('/api/prompts backward compat still works', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const apiBase = (window as any).__API_BASE__ || '';
      const r = await fetch(`${apiBase}/api/prompts`);
      return r.json();
    });
    expect(res.success).toBe(true);
  });

  test('sidebar shows Guidance nav item', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Guidance' })).toBeVisible({
      timeout: 5_000,
    });
  });

  test('playbook quality stats render after usage is tracked', async ({
    page,
  }) => {
    const name = `Quality-${Date.now()}`;

    await page.getByRole('button', { name: '+ New Playbook' }).click();
    await page.getByPlaceholder('Prompt name').fill(name);
    await page
      .getByPlaceholder('Write your prompt here...')
      .fill('Draft a plan for {{topic}}');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Playbook created')).toBeVisible({
      timeout: 5_000,
    });

    const playbookId = page.url().split('/playbooks/')[1];
    expect(playbookId).toBeTruthy();

    await page.evaluate(
      async ({ id }) => {
        const apiBase = (window as any).__API_BASE__ || '';
        await fetch(`${apiBase}/api/playbooks/${id}/run`, { method: 'POST' });
        await fetch(`${apiBase}/api/playbooks/${id}/outcome`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outcome: 'success' }),
        });
      },
      { id: playbookId },
    );

    await page.reload();
    await page.waitForSelector('.split-pane', { timeout: 15_000 });

    await expect(page.getByText('1 run · 100% success').first()).toBeVisible();
    await expect(page.getByText('authored locally')).toBeVisible();

    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete' }).last().click();
    await expect(page.getByText('Playbook deleted')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('guidance playbooks cover edit, duplicate, import, guard, and skill conversion', async ({
    page,
  }) => {
    await seedPlaybookRoutes(page);
    await page.goto('/playbooks');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });

    await expect(
      page.locator('.page__tab--active', { hasText: 'Playbooks' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Release Plan' }).click();
    await expect(
      page.getByRole('heading', { name: 'Release Plan' }),
    ).toBeVisible();

    await page
      .locator('.editor-field')
      .filter({ hasText: 'Content *' })
      .locator('textarea')
      .fill('Updated release plan for {{topic}}');
    await expect(page.getByText('unsaved')).toBeVisible();
    await page.getByRole('button', { name: 'Skills', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Discard them?');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/playbooks\/release-plan/);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Playbook saved')).toBeVisible();

    await page.getByRole('button', { name: 'Package as Skill' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Create Skill From Playbook' }),
    ).toBeVisible();
    await page.getByRole('dialog').locator('input').fill('Release Skill');
    await page.getByRole('button', { name: 'Create Skill' }).click();
    await expect(
      page.getByText('A skill with this name already exists'),
    ).toBeVisible();
    await page.getByRole('dialog').locator('input').fill('Release Skill Copy');
    await page.getByRole('button', { name: 'Create Skill' }).click();
    await expect(page.getByText('Skill package created')).toBeVisible();
    await expect(page).toHaveURL(/\/skills\/Release%20Skill%20Copy/);

    await page.goto('/playbooks/release-plan');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Duplicate' }).click();
    await expect(page.getByText('Playbook created')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Copy of Release Plan' }),
    ).toBeVisible();

    await page.getByRole('button', { name: '+ New Playbook' }).click();
    await page.getByPlaceholder('Prompt name').fill('Release Plan');
    await page
      .getByPlaceholder('Write your prompt here...')
      .fill('Duplicate content');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(
      page.getByText('A playbook with this name already exists'),
    ).toBeVisible();

    await page.goto('/playbooks');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Import .md' }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'handoff.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(
        [
          '---',
          'name: Handoff Plan',
          'description: Team handoff',
          'category: delivery',
          'tags:',
          '  - handoff',
          'global: true',
          '---',
          'Summarize {{work}} for the next owner.',
        ].join('\n'),
      ),
    });
    await expect(page.getByText('1 prompt to import')).toBeVisible();
    await page.getByRole('button', { name: 'Import 1' }).click();
    await expect(page.getByText('Imported 1 playbook')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Handoff Plan' }),
    ).toBeVisible();
  });
});
