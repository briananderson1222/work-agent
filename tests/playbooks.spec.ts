import { expect, test } from '@playwright/test';

test.describe('Playbooks (formerly Prompts)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/playbooks');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });
  });

  test('playbooks page loads', async ({ page }) => {
    await expect(page.locator('.split-pane')).toBeVisible();
  });

  test('/api/playbooks endpoint works', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const apiBase = (window as any).__API_BASE__ || '';
      const r = await fetch(`${apiBase}/api/playbooks`);
      return r.json();
    });
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
  });

  test('/api/prompts backward compat still works', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const apiBase = (window as any).__API_BASE__ || '';
      const r = await fetch(`${apiBase}/api/prompts`);
      return r.json();
    });
    expect(res.success).toBe(true);
  });

  test('sidebar shows Playbooks nav item', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: 'Playbooks' }),
    ).toBeVisible({ timeout: 5_000 });
  });
});
