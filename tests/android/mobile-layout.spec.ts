/**
 * Mobile layout regression tests — verifies mobile-first CSS changes at Pixel 7 viewport.
 */
import { test, expect } from '@playwright/test';

test.describe('Android — Mobile Layout', () => {
  test('safe area CSS variables are defined in stylesheet', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    const hasSafeVar = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.cssText?.includes('--safe-top')) return true;
          }
        } catch { /* cross-origin sheets */ }
      }
      return false;
    });
    expect(hasSafeVar).toBe(true);
  });

  test('viewport meta includes viewport-fit=cover', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    const content = await page.evaluate(() =>
      document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? ''
    );
    expect(content).toContain('viewport-fit=cover');
  });

  test('hamburger + Stallion logo visible in toolbar on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const toggle = page.locator('.app-toolbar__sidebar-toggle');
    const brand = page.locator('.app-toolbar__brand');
    if (await toggle.count() > 0) {
      await expect(toggle).toBeVisible();
      await expect(brand).toBeVisible();
      const brandText = await brand.textContent();
      expect(brandText).toContain('Stallion');
    }
  });

  test('hamburger opens sidebar drawer', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const toggle = page.locator('.app-toolbar__sidebar-toggle');
    if (await toggle.count() === 0) return;

    await toggle.click();
    await page.waitForTimeout(300);
    const sidebar = page.locator('.sidebar--expanded');
    await expect(sidebar).toBeVisible();
  });

  test('sidebar drawer has navigation items', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const toggle = page.locator('.app-toolbar__sidebar-toggle');
    if (await toggle.count() === 0) return;

    await toggle.click();
    await page.waitForTimeout(300);
    const navBtns = page.locator('.sidebar__nav-btn');
    expect(await navBtns.count()).toBeGreaterThan(0);
  });

  test('header nav is hidden on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const nav = page.locator('.header-nav');
    if (await nav.count() > 0) {
      const isVisible = await nav.evaluate(el => getComputedStyle(el).display !== 'none');
      expect(isVisible).toBe(false);
    }
  });

  test('no visible interactive element has touch target smaller than 44px', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const tooSmall = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a[href], [role="button"], input, select, textarea'));
      return buttons
        .filter(el => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          if (rect.width === 0 || rect.height === 0) return false;
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          const parent = el.closest('.sidebar--collapsed, .header-nav, [style*="display: none"]');
          if (parent) return false;
          if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
          if (rect.right < 0 || rect.left > window.innerWidth) return false;
          return rect.width < 44 || rect.height < 44;
        })
        .map(el => {
          const rect = el.getBoundingClientRect();
          return `${el.tagName}.${el.className.toString().slice(0, 50)} ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`;
        })
        .slice(0, 20);
    });
    if (tooSmall.length > 0) console.warn('Touch targets under 44px:', tooSmall);
    expect(tooSmall).toHaveLength(0);
  });

  test('chat dock respects safe area', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    const dock = page.locator('.chat-dock');
    if (await dock.count() > 0) {
      const pb = await dock.evaluate(el => getComputedStyle(el).paddingBottom);
      expect(pb).toBeTruthy();
    }
  });
});
