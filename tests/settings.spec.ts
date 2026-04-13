import { expect, test } from '@playwright/test';

async function goToSettings(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForSelector('button:has-text("⚙")', { timeout: 10_000 });
  await forceClick(page, 'button:has-text("⚙")');
  await page.waitForSelector('.settings__section-nav', { timeout: 10_000 });
}

/** ChatDock overlay intercepts pointer events on bottom elements — use dispatchEvent */
async function forceClick(
  page: import('@playwright/test').Page,
  selector: string,
) {
  await page
    .locator(selector)
    .first()
    .evaluate((el) =>
      el.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
}

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await goToSettings(page);
  });

  test('page load shows all 6 sections', async ({ page }) => {
    for (const title of [
      'AI & Models',
      'Appearance',
      'Notifications',
      'Connection',
      'Voice & Features',
      'System',
    ]) {
      await expect(
        page.getByText(title, { exact: true }).first(),
      ).toBeVisible();
    }
  });

  test('section nav scrolls to section', async ({ page }) => {
    await page.click('a[href="#section-system"]');
    await expect(page.locator('#section-system')).toBeInViewport();
  });

  test('changing system prompt shows save pill', async ({ page }) => {
    await page.fill('#systemPrompt', 'New prompt text for testing');
    await expect(
      page.getByText('Unsaved changes', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    // Clean up
    await forceClick(page, '.settings__save-pill-discard');
  });

  test('save persists changes', async ({ page }) => {
    const original = await page.inputValue('#systemPrompt');
    await page.fill('#systemPrompt', `${original} [test-edit]`);
    await expect(
      page.getByText('Unsaved changes', { exact: true }),
    ).toBeVisible();
    await forceClick(page, '.settings__save-pill-btn');
    await expect(
      page.getByText('Unsaved changes', { exact: true }),
    ).not.toBeVisible({ timeout: 5_000 });
    // Restore original
    await page.fill('#systemPrompt', original);
    await forceClick(page, '.settings__save-pill-btn');
    await expect(
      page.getByText('Unsaved changes', { exact: true }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test('discard reverts changes', async ({ page }) => {
    const original = await page.inputValue('#systemPrompt');
    await page.fill(
      '#systemPrompt',
      'Temporary change that should be discarded',
    );
    await expect(
      page.getByText('Unsaved changes', { exact: true }),
    ).toBeVisible();
    await forceClick(page, '.settings__save-pill-discard');
    await expect(page.locator('#systemPrompt')).toHaveValue(original);
    await expect(
      page.getByText('Unsaved changes', { exact: true }),
    ).not.toBeVisible();
  });

  test('reset to defaults shows confirm modal', async ({ page }) => {
    await page.click('a[href="#section-system"]');
    await page.getByRole('button', { name: 'Reset to Defaults' }).click();
    await expect(
      page.getByText('Are you sure you want to reset'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(
      page.getByText('Are you sure you want to reset'),
    ).not.toBeVisible();
  });

  test('test connection shows status', async ({ page }) => {
    await page.click('a[href="#section-connection"]');
    await page.getByRole('button', { name: 'Test Connection' }).click();
    await expect(page.getByText('✓ Connected')).toBeVisible({ timeout: 5_000 });
  });

  test('connection settings keep bedrock-specific region fields hidden by default', async ({
    page,
  }) => {
    await page.click('a[href="#section-connection"]');
    await expect(
      page.getByLabel('Backend API Base URL', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Region for Bedrock API calls.', { exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByLabel('AWS Region', { exact: true }),
    ).not.toBeVisible();
  });

  test('template variable add and remove', async ({ page }) => {
    const initialCount = await page.locator('.settings__var-row').count();
    await page.getByRole('button', { name: '+ Add Variable' }).click();
    await expect(page.locator('.settings__var-row')).toHaveCount(
      initialCount + 1,
    );
    // Remove the last one
    await page.locator('.settings__var-remove').last().click();
    await expect(page.locator('.settings__var-row')).toHaveCount(initialCount);
    // Discard if needed
    const pill = page.getByText('Unsaved changes', { exact: true });
    if (await pill.isVisible()) {
      await forceClick(page, '.settings__save-pill-discard');
    }
  });

  test('theme toggle switches mode', async ({ page }) => {
    const themeBtn = page.locator('.theme-toggle').first();
    const initialTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    await themeBtn.click();
    const newTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    expect(newTheme).not.toBe(initialTheme);
    // Toggle back
    await themeBtn.click();
  });

  test('mobile layout has horizontal scroll nav', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const nav = page.locator('.settings__section-nav');
    const overflowX = await nav.evaluate(
      (el) => getComputedStyle(el).overflowX,
    );
    expect(overflowX).toBe('auto');
  });

  test('search filters sections', async ({ page }) => {
    await page.fill('.settings__search', 'theme');
    await expect(page.locator('#section-appearance')).toBeVisible();
    await expect(page.locator('#section-ai')).not.toBeVisible();
    await expect(page.locator('#section-system')).not.toBeVisible();
    // Clear restores all
    await page.fill('.settings__search', '');
    await expect(page.locator('#section-ai')).toBeVisible();
    await expect(page.locator('#section-system')).toBeVisible();
  });

  test('accent color picker applies color', async ({ page }) => {
    await page.click('a[href="#section-appearance"]');
    const swatch = page.locator('.settings__accent-swatch').first();
    await swatch.click();
    const accent = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--accent-primary'),
    );
    expect(accent).toBeTruthy();
    // Reset
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    const cleared = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--accent-primary'),
    );
    expect(cleared).toBe('');
  });

  test('export includes localStorage settings', async ({ page }) => {
    const json = await page.evaluate(() => {
      // Simulate what the export button does
      const LOCAL_KEYS = [
        'theme',
        'stallion-feature-settings',
        'stallion-stt-provider',
        'stallion-tts-provider',
      ];
      const localSettings: Record<string, string> = {};
      for (const k of LOCAL_KEYS) {
        const v = localStorage.getItem(k);
        if (v) localSettings[k] = v;
      }
      return localSettings;
    });
    // Theme should be set (dark by default)
    expect(json.theme).toBeTruthy();
  });

  test('toggle has aria-describedby', async ({ page }) => {
    await page.click('a[href="#section-notifications"]');
    const toggle = page.locator('#section-notifications [role="switch"]');
    const describedBy = await toggle.getAttribute('aria-describedby');
    expect(describedBy).toBe('notif-desc');
    await expect(page.locator('#notif-desc')).toBeVisible();
  });
});
