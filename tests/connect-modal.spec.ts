/**
 * E2E: Connection Manager Modal
 *
 * Opens the app, seeds localStorage with a connection, verifies:
 *  - the connection chip appears in the header
 *  - clicking it opens the modal
 *  - adding a new connection via the form works
 *  - switching active connection updates the chip label
 *  - removing a connection works
 */
import { test, expect } from '@playwright/test';

const SEED_STORAGE = `
  window.localStorage.setItem('stallion-connect-connections', JSON.stringify([
    { id: 'conn-1', name: 'Dev Server', url: 'http://localhost:3141', lastConnected: Date.now() }
  ]));
  window.localStorage.setItem('stallion-connect-connections-active', 'conn-1');
`;

test.describe('Connection Manager Modal', () => {
  test.beforeEach(async ({ page }) => {
    // Seed localStorage before the app boots
    await page.addInitScript(SEED_STORAGE);
    await page.goto('/');
    await page.waitForTimeout(1500);
  });

  test('connection chip is visible in the header', async ({ page }) => {
    const chip = page.locator('button', { hasText: 'Dev Server' });
    await expect(chip).toBeVisible();
  });

  test('clicking the chip opens the connection modal', async ({ page }) => {
    await page.locator('button', { hasText: 'Dev Server' }).click();

    const modal = page.locator('text=Connections').first();
    await expect(modal).toBeVisible();

    // The existing connection should appear in the list
    await expect(page.locator('text=Dev Server')).toBeVisible();
  });

  test('can add a new connection manually', async ({ page }) => {
    await page.locator('button', { hasText: 'Dev Server' }).click();
    await page.waitForTimeout(300);

    await page.locator('button', { hasText: '+ Add Manually' }).click();
    await page.fill('input[placeholder="Name (optional)"]', 'Office');
    await page.fill('input[placeholder*="192.168"]', 'http://10.0.0.5:3141');
    await page.locator('button', { hasText: /^Add$/ }).click();

    // New connection should appear in the list
    await expect(page.locator('text=Office')).toBeVisible();
    // Chip should update to show the new active connection
    await expect(page.locator('button', { hasText: 'Office' })).toBeVisible();
  });

  test('can switch between connections', async ({ page }) => {
    // Seed a second connection
    await page.evaluate(() => {
      const conns = JSON.parse(localStorage.getItem('stallion-connect-connections') || '[]');
      conns.push({ id: 'conn-2', name: 'Remote', url: 'http://203.0.113.5:3141' });
      localStorage.setItem('stallion-connect-connections', JSON.stringify(conns));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    await page.locator('button', { hasText: /Dev Server|Remote/ }).first().click();
    await page.waitForTimeout(300);

    // Click the Remote connection row
    await page.locator('div', { hasText: 'Remote' }).first().click();

    // Modal should still be open and chip should update
    await expect(page.locator('text=Remote')).toBeVisible();
  });

  test('can remove a connection', async ({ page }) => {
    // Seed a second connection so we have something to remove
    await page.evaluate(() => {
      const conns = JSON.parse(localStorage.getItem('stallion-connect-connections') || '[]');
      conns.push({ id: 'conn-2', name: 'ToDelete', url: 'http://delete-me:3141' });
      localStorage.setItem('stallion-connect-connections', JSON.stringify(conns));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    await page.locator('button', { hasText: /Dev Server|ToDelete/ }).first().click();
    await page.waitForTimeout(300);

    // Click the × remove button next to ToDelete
    const toDeleteRow = page.locator('div', { hasText: 'ToDelete' }).first();
    await toDeleteRow.locator('button[title="Remove"]').click();

    await expect(page.locator('text=ToDelete')).not.toBeVisible();
  });

  test('modal closes when clicking the backdrop', async ({ page }) => {
    await page.locator('button', { hasText: 'Dev Server' }).click();
    await page.waitForTimeout(300);

    // Click the dark overlay (outside the white card)
    await page.mouse.click(10, 10);
    await page.waitForTimeout(300);

    await expect(page.locator('text=Connections').first()).not.toBeVisible();
  });
});
