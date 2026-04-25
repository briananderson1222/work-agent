import { expect, test } from '@playwright/test';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function startBlankAgentIfNeeded(page: import('@playwright/test').Page) {
  const startBlankButton = page.getByRole('button', { name: /Start Blank/i });
  if (await startBlankButton.isVisible().catch(() => false)) {
    await startBlankButton.click();
  }
}

test.describe('UI CRUD Smoke', () => {
  test('projects CRUD through the live UI', async ({ page }) => {
    const projectName = `Smoke Project ${Date.now()}`;
    const projectSlug = slugify(projectName);
    const updatedName = `${projectName} Updated`;
    const apiBase = `http://localhost:${process.env.STALLION_PORT ?? '3141'}`;

    await page.goto('/projects/new');
    await page.getByRole('heading', { name: 'New Project' }).waitFor({
      timeout: 15_000,
    });

    await page.getByPlaceholder('My Project').fill(projectName);
    await page.getByRole('button', { name: 'Create' }).click();

    await page.waitForURL(new RegExp(`/projects/${projectSlug}$`), {
      timeout: 10_000,
    });

    const update = await page.evaluate(
      async ({ api, slug, name }) => {
        const response = await fetch(`${api}/api/projects/${slug}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        return response.json();
      },
      { api: apiBase, slug: projectSlug, name: updatedName },
    );
    expect(update.success).toBe(true);
    expect(update.data.name).toBe(updatedName);

    const deletion = await page.evaluate(
      async ({ api, slug }) => {
        const response = await fetch(`${api}/api/projects/${slug}`, {
          method: 'DELETE',
        });
        return response.json();
      },
      { api: apiBase, slug: projectSlug },
    );
    expect(deletion.success).toBe(true);
  });

  test('agents CRUD through the live UI', async ({ page }) => {
    const agentName = `Smoke Agent ${Date.now()}`;
    const agentSlug = slugify(agentName);
    const updatedDescription = 'Updated through Playwright smoke coverage.';
    const updatedPrompt = 'You are a smoke-tested connected agent.';

    await page.goto('/agents');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });
    await page.getByRole('button', { name: /^\+ New Agent$/ }).click();
    await page.waitForURL(/\/agents\/new$/, { timeout: 5_000 });
    await startBlankAgentIfNeeded(page);

    await page.selectOption('#ae-agent-type', 'connected');
    await page.getByLabel('Name *').fill(agentName);
    await page.locator('#ae-prompt').fill('You are a helpful smoke test.');
    await page.getByRole('button', { name: 'Create Agent' }).click();

    await page.waitForURL(new RegExp(`/agents/${agentSlug}$`), {
      timeout: 10_000,
    });
    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await expect(saveButton).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^Saving/ })).toHaveCount(0);

    await page.locator('#ae-description').fill(updatedDescription);
    await page.locator('#ae-prompt').fill(updatedPrompt);
    await saveButton.click();
    await expect(page.getByRole('button', { name: /^Saving/ })).toHaveCount(0);

    await page.reload();
    await page.getByRole('button', { name: 'Save Changes' }).waitFor({
      timeout: 15_000,
    });
    await expect(page.locator('#ae-description')).toHaveValue(
      updatedDescription,
    );
    await expect(page.locator('#ae-prompt')).toHaveValue(updatedPrompt);

    await page.getByRole('button', { name: 'Delete' }).first().click();
    await page.getByRole('button', { name: 'Delete' }).last().click();
    await page.waitForURL('**/agents', { timeout: 10_000 });
  });
});
