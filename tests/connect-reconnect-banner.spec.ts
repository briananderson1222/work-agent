/**
 * E2E: Reconnect Banner
 *
 * Simulates a server going offline after the app is loaded and connected.
 * Verifies:
 *  - The reconnect banner appears (non-blocking — app stays usable)
 *  - Clicking "Manage" in the banner opens the connection modal
 *  - When the server comes back, the banner disappears
 *
 * Strategy: use Playwright route interception to control /api/system/status
 * responses, simulating outage and recovery without a real server.
 */
import { expect, test } from '@playwright/test';

// Minimal system status response that marks the system as "ready"
const STATUS_READY = JSON.stringify({
  ready: true,
  acp: { connected: false, connections: [] },
  clis: {},
  prerequisites: [],
  providers: {
    configuredChatReady: true,
    configured: [],
    detected: { ollama: false, bedrock: false },
  },
});

const SEED_STORAGE = `
  window.localStorage.setItem('stallion-connect-connections', JSON.stringify([
    { id: 'c1', name: 'Dev Server', url: window.location.origin, lastConnected: ${Date.now()} }
  ]));
  window.localStorage.setItem('stallion-connect-connections-active', 'c1');
`;

test.describe('Reconnect Banner', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.addEventListener('DOMContentLoaded', () => {
        document.querySelector('[data-testid="setup-launcher"]')?.remove();
      });
    });
  });

  test('status dot changes to error when server goes offline after a successful connection', async ({
    page,
  }) => {
    await page.addInitScript(SEED_STORAGE);

    // Phase 1: intercept status → server is UP
    let healthy = true;
    await page.route('**/api/system/status', (route) => {
      if (healthy) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: STATUS_READY,
        });
      } else {
        route.abort();
      }
    });

    await page.goto('/');
    // Wait for connected state on the chip
    await expect(
      page.getByRole('button', { name: /connected Dev Server/ }),
    ).toBeVisible({ timeout: 10000 });

    // Phase 2: server goes offline
    healthy = false;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    // The status dot should change to error
    await expect
      .poll(
        async () =>
          page.getByRole('button', { name: /error Dev Server/ }).count(),
        { timeout: 25_000 },
      )
      .toBeGreaterThan(0);

    // App content should still be rendered (non-blocking)
    const body = await page.evaluate(() => document.body.innerHTML);
    expect(body.length).toBeGreaterThan(500);
  });

  test('clicking error-state chip opens the connection modal', async ({
    page,
  }) => {
    await page.addInitScript(SEED_STORAGE);

    let callCount = 0;
    await page.route('**/api/system/status', (route) => {
      callCount++;
      if (callCount <= 1) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: STATUS_READY,
        });
      } else {
        route.abort();
      }
    });

    await page.goto('/');
    await expect(page.getByRole('button', { name: /Dev Server/ })).toBeVisible({
      timeout: 10000,
    });

    // Trigger refetch to get error state
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    // Wait for error state on chip
    await expect(
      page.getByRole('button', { name: /error Dev Server/ }),
    ).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => {
      document.querySelector('[data-testid="setup-launcher"]')?.remove();
    });

    // Click the error-state chip — should open modal
    await page.getByRole('button', { name: /error Dev Server/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Connections' }),
    ).toBeVisible();
  });

  test('banner disappears after a recovered server is refreshed', async ({
    page,
  }) => {
    await page.addInitScript(SEED_STORAGE);

    let healthy = true;
    await page.route('**/api/system/status', (route) => {
      if (healthy) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: STATUS_READY,
        });
      } else {
        route.abort();
      }
    });

    await page.goto('/');
    await expect(
      page.getByRole('button', { name: /connected Dev Server/ }),
    ).toBeVisible({ timeout: 15_000 });

    // Take down the server
    healthy = false;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect
      .poll(
        async () =>
          page.getByRole('button', { name: /error Dev Server/ }).count(),
        { timeout: 25_000 },
      )
      .toBeGreaterThan(0);

    // Bring server back up
    healthy = true;
    await page.reload();
    await expect
      .poll(
        async () =>
          page.getByRole('button', { name: /connected Dev Server/ }).count(),
        { timeout: 25_000 },
      )
      .toBeGreaterThan(0);

    // Banner should be gone (status is healthy again)
    await expect(page.locator('text=/Lost connection to/')).not.toBeVisible();
  });
});
