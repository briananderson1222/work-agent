import { expect, test } from '@playwright/test';

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
    await expect(skillsTab).toHaveClass(/page-layout__tab--active/);

    // Click Tools tab
    await toolsTab.click();
    await page.waitForTimeout(500);
    await expect(toolsTab).toHaveClass(/page-layout__tab--active/);
  });

  test('sidebar shows Agents nav item', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Agents' })).toBeVisible({
      timeout: 5_000,
    });
  });
});
