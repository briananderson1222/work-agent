import { expect, test } from '@playwright/test';

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

test.describe('Agents', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/agents');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });
  });

  test('agents page loads with agent list', async ({ page }) => {
    // Wait for loading to finish, then check split pane rendered
    await page
      .waitForFunction(
        () =>
          !document
            .querySelector('.split-pane')
            ?.textContent?.includes('Loading'),
        { timeout: 15_000 },
      )
      .catch(() => {});
    await expect(page.locator('.split-pane')).toBeVisible({ timeout: 5_000 });
  });

  test('+ New Agent opens the new agent flow', async ({ page }) => {
    await page.getByRole('button', { name: /^\+ New Agent$/ }).click();

    await page.waitForURL(/\/agents\/new$/, { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: 'New Agent' })).toBeVisible({
      timeout: 5_000,
    });
    const hasTemplatePicker = await page
      .getByRole('heading', { name: 'Start with a template' })
      .isVisible()
      .catch(() => false);

    if (hasTemplatePicker) {
      await expect(
        page.getByRole('button', { name: /Start Blank/ }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole('button', { name: 'Create Agent' }),
      ).toBeVisible();
      await expect(page.getByLabel('Name *')).toBeVisible();
    }
  });

  test('agent editor shows tabs for managed agent', async ({ page }) => {
    // Click on the first agent in the list
    await page.locator('.split-pane__item').first().click();
    await page.waitForTimeout(1_000);

    // Managed agents should show Basic, Skills, Tools, Commands tabs
    await expect(page.getByRole('button', { name: 'Basic' })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole('button', { name: 'Skills' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tools' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Commands' })).toBeVisible();
  });

  test('clicking tabs switches content', async ({ page }) => {
    await page.locator('.split-pane__item').first().click();
    await page.waitForTimeout(1_000);

    // Click Skills tab
    const skillsTab = page.getByRole('button', { name: 'Skills' });
    const toolsTab = page.getByRole('button', { name: 'Tools' });

    await skillsTab.click();
    await page.waitForTimeout(500);
    await expect(skillsTab).toHaveClass(/page__tab--active/);

    // Click Tools tab
    await toolsTab.click();
    await page.waitForTimeout(500);
    await expect(toolsTab).toHaveClass(/page__tab--active/);
  });

  test('sidebar shows Agents nav item', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Agents' })).toBeVisible({
      timeout: 5_000,
    });
  });

  test('connected agent create flow settles and discard modal stays dismissible', async ({
    page,
  }) => {
    const agents = [
      {
        slug: 'default-agent',
        name: 'Default Agent',
        prompt: 'You are helpful.',
        description: 'Managed agent',
        execution: {
          runtimeConnectionId: 'bedrock-runtime',
        },
      },
    ];

    await page.route('**/api/agents', async (route) => {
      await route.fulfill(json({ success: true, data: agents }));
    });

    await page.route('**/agents', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as {
        slug: string;
        name: string;
        prompt: string;
        execution: { runtimeConnectionId: string };
      };
      agents.push({
        slug: body.slug,
        name: body.name,
        prompt: body.prompt,
        description: '',
        execution: body.execution,
      });
      await route.fulfill(
        json({ success: true, data: { slug: body.slug, ...body } }, 201),
      );
    });

    await page.route('**/api/agents/*', async (route) => {
      const slug = route.request().url().split('/api/agents/')[1];
      const agent = agents.find((entry) => entry.slug === slug);
      if (!agent) {
        await route.fulfill(
          json({ success: false, error: 'Agent not found' }, 404),
        );
        return;
      }
      await route.fulfill(json({ success: true, data: agent }));
    });

    await page.route('**/agents/*/tools', async (route) => {
      await route.fulfill(json({ success: true, data: [] }));
    });

    await page.route('**/api/connections/runtimes', async (route) => {
      await route.fulfill(
        json({
          success: true,
          data: [
            {
              id: 'bedrock-runtime',
              kind: 'runtime',
              type: 'bedrock',
              name: 'Managed Runtime',
              description: 'Managed runtime',
              enabled: true,
              capabilities: ['agent-runtime'],
              config: { executionClass: 'managed' },
              status: 'ready',
              prerequisites: [],
              runtimeCatalog: { source: 'static' },
            },
            {
              id: 'codex-runtime',
              kind: 'runtime',
              type: 'codex',
              name: 'Codex Runtime',
              description: 'Connected runtime',
              enabled: true,
              capabilities: ['agent-runtime'],
              config: { executionClass: 'connected' },
              status: 'ready',
              prerequisites: [],
              runtimeCatalog: { source: 'static' },
            },
          ],
        }),
      );
    });

    await page.route('**/api/connections/models', async (route) => {
      await route.fulfill(json({ success: true, data: [] }));
    });

    await page.route('**/api/templates?type=agent', async (route) => {
      await route.fulfill(json({ success: true, data: [] }));
    });

    await page.route('**/integrations', async (route) => {
      await route.fulfill(json({ success: true, data: [] }));
    });

    await page.route('**/api/system/skills', async (route) => {
      await route.fulfill(json({ success: true, data: [] }));
    });

    await page.route('**/api/playbooks', async (route) => {
      await route.fulfill(json({ success: true, data: [] }));
    });

    await page.goto('/agents');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });

    await page.getByRole('button', { name: /^\+ New Agent$/ }).click();
    await page.waitForURL(/\/agents\/new$/, { timeout: 5_000 });

    const startBlankButton = page.getByRole('button', { name: /Start Blank/i });
    if (await startBlankButton.isVisible().catch(() => false)) {
      await startBlankButton.click();
    }

    await page.selectOption('#ae-agent-type', 'connected');
    await page.getByLabel('Name *').fill('Connected Agent');

    await page.getByRole('button', { name: 'Create Agent' }).click();

    await expect(
      page.getByRole('button', { name: 'Save Changes' }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole('button', { name: 'Create Agent' }),
    ).not.toBeVisible();
    await expect(page).toHaveURL(/\/agents\/connected-agent$/);

    await page.getByRole('button', { name: /^\+ New Agent$/ }).click();
    await expect(page).toHaveURL(/\/agents\/new$/);
    await expect(page.getByRole('dialog')).not.toBeVisible();

    await page.getByLabel('Name *').fill('Draft Agent');
    await page.getByRole('button', { name: /^\+ New Agent$/ }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByLabel('Name *')).toHaveValue('Draft Agent');
  });
});
