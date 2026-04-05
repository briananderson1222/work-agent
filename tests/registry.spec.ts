import { expect, test } from '@playwright/test';

test.describe('Registry page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/registry');
    // Wait for the app to load past the onboarding gate
    await page.waitForSelector('.page-layout__tab', { timeout: 15_000 });
  });

  test('registry page loads with tabs', async ({ page }) => {
    const tabs = page.locator('.page-layout__tab');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toHaveText('Agents');
    await expect(tabs.nth(1)).toHaveText('Skills');
    await expect(tabs.nth(2)).toHaveText('Integrations');
    await expect(tabs.nth(3)).toHaveText('Plugins');
  });

  test('switching tabs works', async ({ page }) => {
    // Click Skills tab
    await page.locator('.page-layout__tab', { hasText: 'Skills' }).click();
    await page.waitForTimeout(500);

    // Verify Skills tab is active
    await expect(
      page.locator('.page-layout__tab--active'),
    ).toHaveText('Skills');

    // Click Plugins tab
    await page.locator('.page-layout__tab', { hasText: 'Plugins' }).click();
    await page.waitForTimeout(500);

    await expect(
      page.locator('.page-layout__tab--active'),
    ).toHaveText('Plugins');
  });

  test('sidebar shows Registry nav item', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: 'Registry' }),
    ).toBeVisible({ timeout: 5_000 });
  });
});
