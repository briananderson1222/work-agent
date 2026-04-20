import { expect, type Page, test } from '@playwright/test';

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

async function seedProjectFormRoutes(page: Page) {
  const state = {
    projects: [] as Array<{
      id: string;
      slug: string;
      name: string;
      workingDirectory?: string;
    }>,
  };

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path === '/api/system/status') {
      await route.fulfill(
        json({
          ready: true,
          acp: { connected: false, connections: [] },
          clis: {},
          prerequisites: [],
          providers: {
            configuredChatReady: true,
            configured: [],
            detected: { ollama: false, bedrock: false },
          },
        }),
      );
      return;
    }

    if (path === '/api/system/capabilities') {
      await route.fulfill(
        json({
          runtime: 'voltagent',
          voice: { stt: [], tts: [] },
          context: { providers: [] },
          scheduler: true,
        }),
      );
      return;
    }

    if (path === '/api/auth/status') {
      await route.fulfill(json({ authenticated: true, user: null }));
      return;
    }

    if (path === '/api/branding') {
      await route.fulfill(json({ success: true, data: {} }));
      return;
    }

    if (path === '/api/projects' && method === 'GET') {
      await route.fulfill(json({ success: true, data: state.projects }));
      return;
    }

    if (path === '/api/projects' && method === 'POST') {
      const body = route.request().postDataJSON() as {
        name: string;
        slug: string;
        workingDirectory?: string;
      };
      const project = {
        id: `p-${body.slug}`,
        slug: body.slug,
        name: body.name,
        workingDirectory: body.workingDirectory,
      };
      state.projects.push(project);
      await route.fulfill(json({ success: true, data: project }, 201));
      return;
    }

    if (path === '/api/templates') {
      await route.fulfill(json({ success: true, data: [] }));
      return;
    }

    if (path === '/api/fs/browse') {
      await route.fulfill(
        json({
          success: true,
          data: {
            path: '/tmp',
            entries: [{ name: 'demo', isDirectory: true }],
          },
        }),
      );
      return;
    }

    await route.fulfill(json({ success: true, data: [] }));
  });
}

async function fillStable(page: Page, selector: string, value: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const locator = page.locator(selector).first();
    try {
      await locator.fill(value, { timeout: 1_000 });
      if ((await locator.inputValue().catch(() => '')) === value) {
        return;
      }
    } catch {}
    await page.waitForTimeout(150);
  }

  throw new Error(`Failed to fill stable input: ${selector}`);
}

test.describe('Project forms', () => {
  test.beforeEach(async ({ page }) => {
    await seedProjectFormRoutes(page);
  });

  test('new project prioritizes working directory and derives the name from the path leaf', async ({
    page,
  }) => {
    await page.goto('/projects/new');

    await expect(
      page.getByRole('heading', { name: 'New Project' }),
    ).toBeVisible();

    await fillStable(page, 'input[placeholder="/path/to/project"]', '/tmp');

    const nameInput = page.locator('input[placeholder="My Project"]');
    await expect(nameInput).toHaveValue('Tmp');

    await fillStable(page, 'input[placeholder="My Project"]', 'Launchpad');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page).toHaveURL(/\/projects\/launchpad$/);
  });
});
