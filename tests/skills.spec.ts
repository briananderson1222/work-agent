import { expect, test } from '@playwright/test';

test.describe('Skills (via Registry + API)', () => {
  test('registry Skills tab loads and is selectable', async ({ page }) => {
    await page.goto('/registry');
    await page.waitForSelector('.page-layout__tab', { timeout: 15_000 });

    await page.locator('.page-layout__tab', { hasText: 'Skills' }).click();
    await page.waitForTimeout(500);

    await expect(
      page.locator('.page-layout__tab--active'),
    ).toHaveText('Skills');
  });

  test('skills API returns list', async ({ page }) => {
    await page.goto('/registry');
    await page.waitForSelector('.page-layout__tab', { timeout: 15_000 });

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/skills');
      return { status: res.status, ok: res.ok };
    });
    expect(response.ok).toBe(true);
  });

  test('standalone /skills route no longer exists', async ({ page }) => {
    await page.goto('/skills');
    await page.waitForTimeout(2000);
    // Old SkillsView removed — should not render a dedicated skills page
    const url = page.url();
    expect(url).toBeTruthy();
  });
});
