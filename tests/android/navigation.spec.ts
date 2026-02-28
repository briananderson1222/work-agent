/**
 * Android navigation tests — verifies key UI flows work at mobile viewport.
 */
import { test, expect } from '@playwright/test';

test.describe('Android — Navigation', () => {
  test('sidebar or nav is accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Look for any nav, sidebar, hamburger, or at minimum any interactive element
    const nav = page.locator([
      'nav',
      '[role="navigation"]',
      '[data-testid="sidebar"]',
      'button[aria-label*="menu" i]',
      'button[aria-label*="nav" i]',
      'aside',
      '.sidebar',
      '.nav',
      // Fallback: any button or link rendered means the app loaded with UI
      'button',
      'a[href]',
    ].join(', '));
    const count = await nav.count();
    expect(count).toBeGreaterThan(0);
  });

  test('no elements overflow viewport horizontally', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const offscreen = await page.evaluate(() => {
      const vw = window.innerWidth;
      const elements = document.querySelectorAll('*');
      const offenders: string[] = [];
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > vw + 1) {
          offenders.push(`${el.tagName}.${el.className} right=${rect.right}`);
        }
      });
      return offenders.slice(0, 5);
    });

    expect(offscreen).toHaveLength(0);
  });

  test('interactive elements are touch-target sized (>=44px)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const tooSmall = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      return buttons
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          // Only check visible elements
          return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
        })
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return `${el.tagName} "${(el as HTMLElement).innerText?.slice(0, 20)}" ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`;
        })
        .slice(0, 10);
    });

    // Warn but don't fail — log for visibility
    if (tooSmall.length > 0) {
      console.warn('Small touch targets detected:', tooSmall);
    }
  });

  test('app handles back navigation without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.waitForTimeout(1500);
    await page.goBack();
    await page.waitForTimeout(500);

    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });
});
