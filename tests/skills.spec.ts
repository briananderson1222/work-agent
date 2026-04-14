import { expect, test } from '@playwright/test';

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
    await page.waitForTimeout(500);

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
});
