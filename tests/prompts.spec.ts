import { expect, test } from '@playwright/test';

/** ChatDock overlay intercepts pointer events — use dispatchEvent */
async function forceClick(
  page: import('@playwright/test').Page,
  selector: string,
) {
  await page
    .locator(selector)
    .evaluate((el) =>
      el.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
}

test.describe('Prompts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/prompts');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });
  });

  test('page loads with heading and empty state', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Prompts' })).toBeVisible();
    // Either empty state or list items
    const empty = page.getByText('No prompt selected');
    const items = page.locator('.split-pane__item');
    const hasEmpty = await empty.isVisible().catch(() => false);
    const hasItems = (await items.count()) > 0;
    expect(hasEmpty || hasItems).toBeTruthy();
  });

  test('full CRUD lifecycle: create → edit → delete', async ({ page }) => {
    const name = `E2E-${Date.now()}`;

    // CREATE
    await page.getByRole('button', { name: '+ New Prompt' }).click();
    await page.getByPlaceholder('Prompt name').fill(name);
    await page
      .getByPlaceholder('Write your prompt here...')
      .fill('Test content');
    await forceClick(page, '.editor-btn--primary');
    await expect(page.getByText('Prompt created')).toBeVisible({
      timeout: 5_000,
    });

    // EDIT
    await page
      .getByPlaceholder('Write your prompt here...')
      .fill('Updated content');
    await forceClick(page, '.editor-btn--primary');
    await expect(page.getByText('Prompt saved')).toBeVisible({
      timeout: 5_000,
    });

    // DELETE
    await forceClick(page, '.editor-btn--danger');
    await expect(page.getByText('Delete Prompt')).toBeVisible();
    await page.getByRole('button', { name: 'Delete' }).last().click();
    await expect(page.getByText('Prompt deleted')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('template variable tags appear below content', async ({ page }) => {
    // Create prompt with vars
    await page.getByRole('button', { name: '+ New Prompt' }).click();
    await page.getByPlaceholder('Prompt name').fill(`Vars-${Date.now()}`);
    await page
      .getByPlaceholder('Write your prompt here...')
      .fill('Hello {{name}}, role: {{role}}');

    // Check tags
    await expect(
      page.locator('.editor__tag').filter({ hasText: '{{name}}' }),
    ).toBeVisible();
    await expect(
      page.locator('.editor__tag').filter({ hasText: '{{role}}' }),
    ).toBeVisible();

    // Remove a var
    await page
      .getByPlaceholder('Write your prompt here...')
      .fill('Hello {{name}}');
    await expect(
      page.locator('.editor__tag').filter({ hasText: '{{role}}' }),
    ).not.toBeVisible();
    await expect(
      page.locator('.editor__tag').filter({ hasText: '{{name}}' }),
    ).toBeVisible();

    // Create then clean up
    await forceClick(page, '.editor-btn--primary');
    await page.waitForTimeout(1_000);
    await forceClick(page, '.editor-btn--danger');
    await page.getByRole('button', { name: 'Delete' }).last().click();
  });

  test('inline validation shows errors on blur', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Prompt' }).click();

    // Focus and blur Name
    await page.getByPlaceholder('Prompt name').focus();
    await page.getByPlaceholder('Write your prompt here...').focus();
    await expect(page.getByText('Name is required')).toBeVisible();

    // Focus and blur Content
    await page.getByPlaceholder('Optional description').focus();
    await expect(page.getByText('Content is required')).toBeVisible();

    // Button should be disabled
    await expect(page.locator('.editor-btn--primary')).toBeDisabled();
  });

  test('save button disabled when name or content empty', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Prompt' }).click();
    await expect(page.locator('.editor-btn--primary')).toBeDisabled();

    // Name only → still disabled
    await page.getByPlaceholder('Prompt name').fill('Test');
    await expect(page.locator('.editor-btn--primary')).toBeDisabled();

    // Add content → enabled
    await page.getByPlaceholder('Write your prompt here...').fill('Content');
    await expect(page.locator('.editor-btn--primary')).toBeEnabled();

    // Clear name → disabled
    await page.getByPlaceholder('Prompt name').fill('');
    await expect(page.locator('.editor-btn--primary')).toBeDisabled();
  });

  test('search filters prompt list', async ({ page }) => {
    const a = `SearchA-${Date.now()}`;
    const b = `SearchB-${Date.now()}`;

    // Create two prompts
    for (const name of [a, b]) {
      await page.getByRole('button', { name: '+ New Prompt' }).click();
      await page.getByPlaceholder('Prompt name').fill(name);
      await page.getByPlaceholder('Write your prompt here...').fill('content');
      await forceClick(page, '.editor-btn--primary');
      await page.waitForTimeout(1_000);
    }

    // Search for first
    await page.getByPlaceholder('Search prompts...').fill(a);
    await expect(
      page.locator('.split-pane__item').filter({ hasText: a }),
    ).toBeVisible();
    await expect(
      page.locator('.split-pane__item').filter({ hasText: b }),
    ).not.toBeVisible();

    // Clear search
    await page.getByPlaceholder('Search prompts...').fill('');
    await expect(
      page.locator('.split-pane__item').filter({ hasText: b }),
    ).toBeVisible();

    // Clean up
    for (const name of [a, b]) {
      await page.locator('.split-pane__item').filter({ hasText: name }).click();
      await page.waitForTimeout(500);
      await forceClick(page, '.editor-btn--danger');
      await page.getByRole('button', { name: 'Delete' }).last().click();
      await page.waitForTimeout(500);
    }
  });

  test('unsaved changes badge appears on edit', async ({ page }) => {
    const name = `Badge-${Date.now()}`;

    // Create
    await page.getByRole('button', { name: '+ New Prompt' }).click();
    await page.getByPlaceholder('Prompt name').fill(name);
    await page.getByPlaceholder('Write your prompt here...').fill('original');
    await forceClick(page, '.editor-btn--primary');
    await page.waitForTimeout(1_000);

    // Edit → badge appears
    await page.getByPlaceholder('Write your prompt here...').fill('modified');
    await expect(page.getByText('unsaved')).toBeVisible();

    // Save → badge disappears
    await forceClick(page, '.editor-btn--primary');
    await page.waitForTimeout(1_000);
    await expect(page.getByText('unsaved')).not.toBeVisible();

    // Clean up
    await forceClick(page, '.editor-btn--danger');
    await page.getByRole('button', { name: 'Delete' }).last().click();
  });

  test('delete confirmation modal has cancel', async ({ page }) => {
    const name = `Cancel-${Date.now()}`;

    // Create
    await page.getByRole('button', { name: '+ New Prompt' }).click();
    await page.getByPlaceholder('Prompt name').fill(name);
    await page.getByPlaceholder('Write your prompt here...').fill('content');
    await forceClick(page, '.editor-btn--primary');
    await page.waitForTimeout(1_000);

    // Delete → Cancel
    await forceClick(page, '.editor-btn--danger');
    await expect(page.getByText('Delete Prompt')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(
      page.locator('.split-pane__item').filter({ hasText: name }),
    ).toBeVisible();

    // Delete → Confirm
    await forceClick(page, '.editor-btn--danger');
    await page.getByRole('button', { name: 'Delete' }).last().click();
    await expect(page.getByText('Prompt deleted')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('prompts appears in sidebar navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.sidebar', { timeout: 10_000 });
    const labels = await page.locator('.sidebar__nav-label').allTextContents();
    expect(labels).toContain('Prompts');
  });

  test('prompts accessible from Agents Hub', async ({ page }) => {
    await page.goto('/agents');
    await page.waitForSelector('.agents-hub', { timeout: 15_000 });
    // Prompts section should exist with Browse button
    const promptsSection = page
      .locator('.agents-hub__section')
      .filter({ hasText: 'Prompts' });
    await expect(promptsSection).toBeVisible();
    await expect(
      promptsSection.locator('.agents-hub__add-btn', { hasText: 'Browse' }),
    ).toBeVisible();
  });
});
