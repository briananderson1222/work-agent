import { expect, test } from '@playwright/test';

test.describe('Agents', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/agents');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });
  });

  test('agents page loads with agent list', async ({ page }) => {
    await expect(
      page.locator('.split-pane__item').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('agent editor shows tabs for managed agent', async ({ page }) => {
    // Click on the first agent in the list
    await page.locator('.split-pane__item').first().click();
    await page.waitForTimeout(1_000);

    // Managed agents should show Basic, Skills, Tools, Commands tabs
    await expect(
      page.locator('.page-layout__tab', { hasText: 'Basic' }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator('.page-layout__tab', { hasText: 'Skills' }),
    ).toBeVisible();
    await expect(
      page.locator('.page-layout__tab', { hasText: 'Tools' }),
    ).toBeVisible();
    await expect(
      page.locator('.page-layout__tab', { hasText: 'Commands' }),
    ).toBeVisible();
  });

  test('clicking tabs switches content', async ({ page }) => {
    await page.locator('.split-pane__item').first().click();
    await page.waitForTimeout(1_000);

    // Click Skills tab
    await page.locator('.page-layout__tab', { hasText: 'Skills' }).click();
    await page.waitForTimeout(500);
    await expect(
      page.locator('.page-layout__tab--active'),
    ).toHaveText('Skills');

    // Click Tools tab
    await page.locator('.page-layout__tab', { hasText: 'Tools' }).click();
    await page.waitForTimeout(500);
    await expect(
      page.locator('.page-layout__tab--active'),
    ).toHaveText('Tools');
  });

  test('sidebar shows Agents nav item', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: 'Agents' }),
    ).toBeVisible({ timeout: 5_000 });
  });
});
