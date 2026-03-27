import { expect, test } from '@playwright/test';

test.describe('Agents CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/agents');
    await page.waitForSelector('.agents-hub', { timeout: 15_000 });
  });

  test('lists agents on the hub page', async ({ page }) => {
    await expect(page.getByText('Agents Hub')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.agents-hub__card').first()).toBeVisible();
  });

  test('full CRUD lifecycle: create → edit → delete', async ({ page }) => {
    const agentName = `QA-E2E-${Date.now()}`;

    // --- CREATE ---
    // Click "+ New" on the Agents section header in the hub
    await page
      .locator('.agents-hub__section')
      .first()
      .locator('.agents-hub__add-btn', { hasText: '+ New' })
      .click();
    await page.waitForTimeout(1_000);

    // Pick blank template if template picker is shown
    const blankBtn = page.getByText('Start Blank →');
    if (await blankBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await blankBtn.click();
    }

    // Fill required fields
    await page.getByPlaceholder('My Agent').fill(agentName);
    await page
      .getByPlaceholder('You are a helpful assistant...')
      .fill('Test agent for e2e.');

    // Create
    await page.getByRole('button', { name: 'Create Agent' }).click();
    await page.waitForTimeout(3_000);

    // Verify server is still responsive after create
    const statusRes = await page.request.get('/api/system/status');
    expect(statusRes.ok()).toBeTruthy();

    // --- EDIT ---
    const descInput = page.getByPlaceholder('A helpful agent for...');
    await descInput.fill('Updated by e2e test');

    // Save — use dispatchEvent to bypass ChatDock overlay
    const saveBtn = page.getByRole('button', { name: /Save Changes/i });
    await saveBtn.evaluate((el) =>
      el.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    await page.waitForTimeout(2_000);

    // Verify server still up after update
    const statusRes2 = await page.request.get('/api/system/status');
    expect(statusRes2.ok()).toBeTruthy();

    // --- DELETE ---
    const deleteBtn = page.getByRole('button', { name: 'Delete' });
    await deleteBtn.evaluate((el) =>
      el.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );

    // Confirm deletion
    await expect(page.getByText('Delete Agent')).toBeVisible({
      timeout: 3_000,
    });
    await page.locator('.modal-footer .button--danger').click();
    await page.waitForTimeout(2_000);

    // Verify server still up after delete
    const statusRes3 = await page.request.get('/api/system/status');
    expect(statusRes3.ok()).toBeTruthy();
  });

  test('nonexistent agent shows not-found state', async ({ page }) => {
    await page.goto('/agents/nonexistent-slug-e2e-test');
    await expect(page.getByText('Agent not found')).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole('button', { name: 'Back to agents' }),
    ).toBeVisible();
  });
});
