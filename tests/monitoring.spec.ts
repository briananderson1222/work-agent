import { expect, test } from '@playwright/test';

test.describe('Monitoring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/monitoring');
  });

  test('monitoring page renders its primary shell', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'MONITORING' })).toBeVisible(
      { timeout: 15_000 },
    );
    await expect(page.getByLabel(/Monitoring connection/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Monitoring' }),
    ).toBeVisible();
  });
});
