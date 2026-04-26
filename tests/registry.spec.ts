import { expect, type Page, test } from '@playwright/test';

async function forceClick(page: Page, selector: string) {
  await page
    .locator(selector)
    .evaluate((el) =>
      el.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
}

async function mockRegistry(page: Page) {
  const installCalls: string[] = [];
  const installed = {
    agents: new Set<string>(),
    skills: new Set<string>(),
    integrations: new Set<string>(),
    plugins: new Set<string>(),
  };
  const catalog = {
    agents: [
      {
        id: 'project-planner',
        displayName: 'Project Planner',
        description: 'Planning-focused agent',
        source: 'registry',
        version: '2.0.0',
      },
    ],
    skills: [
      {
        id: 'prompt-toolkit',
        displayName: 'Prompt Toolkit',
        description: 'Starter prompts and helpers',
        source: 'registry',
        version: '1.2.0',
      },
    ],
    integrations: [
      {
        id: 'slack-notifier',
        displayName: 'Slack Notifier',
        description: 'Post updates to Slack',
        source: 'registry',
        version: '0.9.0',
      },
      {
        id: 'broken-integration',
        displayName: 'Broken Integration',
        description: 'Fails install for policy coverage',
        source: 'registry',
        version: '0.1.0',
      },
    ],
    plugins: [
      {
        id: 'demo-layout',
        displayName: 'Demo Layout',
        description: 'Starter plugin',
        source: '../demo-layout',
        version: '1.0.0',
      },
    ],
  };

  function itemWithInstallState(tab: keyof typeof catalog) {
    return catalog[tab].map((item) => ({
      ...item,
      installed: installed[tab].has(item.id),
    }));
  }

  function installedItems(tab: keyof typeof catalog) {
    return itemWithInstallState(tab).filter((item) => item.installed);
  }

  for (const tab of Object.keys(catalog) as Array<keyof typeof catalog>) {
    await page.route(`**/api/registry/${tab}/*`, async (route) => {
      const id = decodeURIComponent(
        new URL(route.request().url()).pathname.split('/').pop() ?? '',
      );
      installed[tab].delete(id);
      await route.fulfill({
        json: { success: true, action: 'uninstall', id },
      });
    });
    await page.route(`**/api/registry/${tab}`, (route) =>
      route.fulfill({
        json: { success: true, data: itemWithInstallState(tab) },
      }),
    );
    await page.route(`**/api/registry/${tab}/installed`, (route) =>
      route.fulfill({ json: { success: true, data: installedItems(tab) } }),
    );
    await page.route(`**/api/registry/${tab}/install`, async (route) => {
      const body = route.request().postDataJSON();
      if (body.id === 'broken-integration') {
        await route.fulfill({
          status: 500,
          json: { success: false, error: 'Install blocked by policy' },
        });
        return;
      }
      installed[tab].add(body.id);
      installCalls.push(`${tab}/install`);
      await route.fulfill({
        json: { success: true, action: 'install', id: body.id },
      });
    });
  }

  return { catalog, installCalls, installed };
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

    // Verify Skills tab is active
    await expect(page.locator('.page__tab--active')).toHaveText('Skills');

    // Click Plugins tab
    await page.locator('.page__tab', { hasText: 'Plugins' }).click();

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

  test('registry tabs install, remove, search, and surface action failures', async ({
    page,
  }) => {
    await mockRegistry(page);
    await page.goto('/registry');
    await page.waitForSelector('.page__tab', { timeout: 15_000 });

    const cases = [
      {
        tab: 'Agents',
        item: 'Project Planner',
        install: 'Install',
        remove: 'Remove',
      },
      {
        tab: 'Skills',
        item: 'Prompt Toolkit',
        install: 'Install to workspace',
        remove: 'Remove from workspace',
      },
      {
        tab: 'Integrations',
        item: 'Slack Notifier',
        install: 'Install',
        remove: 'Remove',
      },
      {
        tab: 'Plugins',
        item: 'Demo Layout',
        install: 'Install',
        remove: 'Remove',
      },
    ];

    for (const entry of cases) {
      await page.locator('.page__tab', { hasText: entry.tab }).click();
      await expect(page.getByTestId('registry-detail')).toContainText(
        entry.item,
      );
      await page
        .getByLabel(new RegExp(`Search ${entry.tab.toLowerCase()}`))
        .fill('no-match');
      await expect(
        page.getByText(`No matching ${entry.tab.toLowerCase()}`),
      ).toBeVisible();
      await page
        .getByLabel(new RegExp(`Search ${entry.tab.toLowerCase()}`))
        .fill('');
      await expect(page.getByTestId('registry-detail')).toContainText(
        entry.item,
      );

      await page
        .getByTestId('registry-detail')
        .getByRole('button', { name: entry.install })
        .click();
      await expect(page.getByText(`Installed ${entry.item}`)).toBeVisible();
      await expect(
        page.getByTestId('registry-detail').getByText('Installed'),
      ).toBeVisible();
      await page
        .getByTestId('registry-detail')
        .getByRole('button', { name: entry.remove })
        .click();
      await expect(page.getByText(`Removed ${entry.item}`)).toBeVisible();
      await expect(
        page.getByTestId('registry-detail').getByText('Available'),
      ).toBeVisible();
    }

    await page.locator('.page__tab', { hasText: 'Integrations' }).click();
    await page.getByRole('button', { name: /Broken Integration/ }).click();
    await page
      .getByTestId('registry-detail')
      .getByRole('button', { name: 'Install' })
      .click();
    await expect(page.getByText('Install blocked by policy')).toBeVisible();
  });
});
