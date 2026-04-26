import { expect, test } from '@playwright/test';

test.describe('Prompts Compatibility', () => {
  test('legacy /prompts route resolves to the playbooks surface', async ({
    page,
  }) => {
    await page.goto('/prompts');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });

    await expect(page.locator('.split-pane')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guidance' })).toBeVisible();
  });

  test('/api/prompts remains available as a compatibility alias', async ({
    page,
  }) => {
    await page.goto('/playbooks');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });

    const res = await page.evaluate(async () => {
      const apiBase = (window as any).__API_BASE__ || '';
      const response = await fetch(`${apiBase}/api/prompts`);
      const body = await response.json();
      return { ok: response.ok, body };
    });

    expect(res.ok).toBe(true);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
