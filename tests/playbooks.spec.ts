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
    await expect(page.getByRole('button', { name: 'Playbooks' })).toBeVisible({
      timeout: 5_000,
    });
  });

  test('playbook quality stats render after usage is tracked', async ({
    page,
  }) => {
    const name = `Quality-${Date.now()}`;

    await page.getByRole('button', { name: '+ New Playbook' }).click();
    await page.getByPlaceholder('Prompt name').fill(name);
    await page
      .getByPlaceholder('Write your prompt here...')
      .fill('Draft a plan for {{topic}}');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Playbook created')).toBeVisible({
      timeout: 5_000,
    });

    const playbookId = page.url().split('/playbooks/')[1];
    expect(playbookId).toBeTruthy();

    await page.evaluate(
      async ({ id }) => {
        const apiBase = (window as any).__API_BASE__ || '';
        await fetch(`${apiBase}/api/playbooks/${id}/run`, { method: 'POST' });
        await fetch(`${apiBase}/api/playbooks/${id}/outcome`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outcome: 'success' }),
        });
      },
      { id: playbookId },
    );

    await page.reload();
    await page.waitForSelector('.split-pane', { timeout: 15_000 });

    await expect(page.getByText('1 run · 100% success').first()).toBeVisible();
    await expect(page.getByText('authored locally')).toBeVisible();

    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete' }).last().click();
    await expect(page.getByText('Playbook deleted')).toBeVisible({
      timeout: 5_000,
    });
  });
});
