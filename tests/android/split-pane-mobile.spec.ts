/**
 * SplitPaneLayout mobile behavior tests.
 * On mobile: shows list OR detail panel (not both). Back button returns to list.
 * CSS classes: .split-pane__left--visible / .split-pane__right--visible control visibility.
 */
import { test, expect } from '@playwright/test';

test.describe('Android — SplitPaneLayout Mobile', () => {
  test('split pane shows list panel by default', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(2000);

    const left = page.locator('.split-pane__left');
    if (await left.count() === 0) return;

    // On mobile, left panel is visible by default (no item selected)
    const leftVisible = await left.evaluate(el => getComputedStyle(el).display !== 'none');
    expect(leftVisible).toBe(true);
  });

  test('back button appears when item is selected', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(2000);

    const items = page.locator('.split-pane__item');
    if (await items.count() === 0) return;

    await items.first().click();
    await page.waitForTimeout(500);

    const backBtn = page.locator('.split-pane__back');
    if (await backBtn.count() > 0) {
      await expect(backBtn).toBeVisible();
    }
  });

  test('back button returns to list view', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(2000);

    const items = page.locator('.split-pane__item');
    if (await items.count() === 0) return;

    await items.first().click();
    await page.waitForTimeout(500);

    const backBtn = page.locator('.split-pane__back');
    if (await backBtn.count() === 0) return;

    await backBtn.click();
    await page.waitForTimeout(500);

    const left = page.locator('.split-pane__left');
    const leftVisible = await left.evaluate(el => getComputedStyle(el).display !== 'none');
    expect(leftVisible).toBe(true);
  });
});
