import { expect, test } from '@playwright/test';

async function forceClick(
  page: import('@playwright/test').Page,
  selector: string,
) {
  await page
    .locator(selector)
    .evaluate((el) =>
      el.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
}

async function mockRegistry(page: import('@playwright/test').Page) {
  const installCalls: string[] = [];

  await page.route('**/api/registry/agents/installed', (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  );
  await page.route('**/api/registry/agents', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: [
          {
            id: 'project-planner',
            displayName: 'Project Planner',
            description: 'Planning-focused agent',
            source: 'registry',
            version: '2.0.0',
          },
        ],
      },
    }),
  );
  await page.route('**/api/registry/skills/installed', (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  );
  await page.route('**/api/registry/skills', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: [
          {
            id: 'prompt-toolkit',
            displayName: 'Prompt Toolkit',
            description: 'Starter prompts and helpers',
            source: 'registry',
            version: '1.2.0',
          },
        ],
      },
    }),
  );
  await page.route('**/api/registry/integrations/installed', (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  );
  await page.route('**/api/registry/integrations', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: [
          {
            id: 'slack-notifier',
            displayName: 'Slack Notifier',
            description: 'Post updates to Slack',
            source: 'registry',
            version: '0.9.0',
          },
        ],
      },
    }),
  );
  await page.route('**/api/registry/plugins/installed', (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  );
  await page.route('**/api/registry/plugins', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: [
          {
            id: 'demo-layout',
            displayName: 'Demo Layout',
            description: 'Starter plugin',
            source: '../demo-layout',
            version: '1.0.0',
          },
        ],
      },
    }),
  );
  await page.route('**/api/registry/skills/install', async (route) => {
    installCalls.push('skills/install');
    await route.fulfill({
      json: { success: true, action: 'install', id: 'prompt-toolkit' },
    });
  });

  return { installCalls };
}

test.describe('Registry page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/registry');
    // Wait for the app to load past the onboarding gate
    await page.waitForSelector('.page__tab', { timeout: 15_000 });
  });

  test('registry page loads with tabs', async ({ page }) => {
    const tabs = page.locator('.page__tab');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toHaveText('Agents');
    await expect(tabs.nth(1)).toHaveText('Skills');
    await expect(tabs.nth(2)).toHaveText('Integrations');
    await expect(tabs.nth(3)).toHaveText('Plugins');
  });

  test('switching tabs works', async ({ page }) => {
    // Click Skills tab
    await page.locator('.page__tab', { hasText: 'Skills' }).click();
    await page.waitForTimeout(500);

    // Verify Skills tab is active
    await expect(page.locator('.page__tab--active')).toHaveText('Skills');

    // Click Plugins tab
    await page.locator('.page__tab', { hasText: 'Plugins' }).click();
    await page.waitForTimeout(500);

    await expect(page.locator('.page__tab--active')).toHaveText('Plugins');
  });

  test('sidebar shows Registry nav item', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Registry' })).toBeVisible({
      timeout: 5_000,
    });
  });

  test('skill cards open preview details before explicit install', async ({
    page,
  }) => {
    const { installCalls } = await mockRegistry(page);
    await page.goto('/registry');
    await page.waitForSelector('.page__tab', { timeout: 15_000 });

    await forceClick(page, '.page__tab:has-text("Skills")');
    await page.getByRole('button', { name: /Prompt Toolkit/i }).click();

    await expect(page.getByTestId('registry-detail')).toContainText(
      'Prompt Toolkit',
    );
    await expect(page.getByTestId('registry-detail')).toContainText(
      'Starter prompts and helpers',
    );
    await expect(installCalls).toHaveLength(0);

    await page
      .getByTestId('registry-detail')
      .getByRole('button', { name: /Install to workspace/i })
      .click();
    await expect.poll(() => installCalls.length).toBe(1);
  });
});
