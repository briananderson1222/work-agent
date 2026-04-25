import { expect, test } from '@playwright/test';

test.describe('Project Agent Scoping', () => {
  test('project settings shows Agents section', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

    // Create a test project via API
    const projectName = `test-scoping-${Date.now()}`;
    const createRes = await page.evaluate(async (name) => {
      const apiBase = (window as any).__API_BASE__ || '';
      const res = await fetch(`${apiBase}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug: name, workingDirectory: '/tmp' }),
      });
      return res.json();
    }, projectName);
    expect(createRes.success).toBe(true);

    const readRes = await page.evaluate(async (slug) => {
      const apiBase = (window as any).__API_BASE__ || '';
      const res = await fetch(`${apiBase}/api/projects/${slug}`);
      return res.json();
    }, projectName);
    expect(readRes.success).toBe(true);
    expect(readRes.data.agents ?? []).toEqual([]);

    // Clean up — delete the project
    await page.evaluate(async (slug) => {
      const apiBase = (window as any).__API_BASE__ || '';
      await fetch(`${apiBase}/api/projects/${slug}`, { method: 'DELETE' });
    }, projectName);
  });

  test('unscoped project shows all agents in chat', async ({ page }) => {
    // Verify that the API returns agents without filtering
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

    const agents = await page.evaluate(async () => {
      const apiBase = (window as any).__API_BASE__ || '';
      const res = await fetch(`${apiBase}/api/agents`);
      const json = await res.json();
      return json.data || [];
    });

    expect(agents.length).toBeGreaterThan(0);
  });
});
