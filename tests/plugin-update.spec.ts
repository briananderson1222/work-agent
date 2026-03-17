/**
 * Plugin update flow — verifies update detection banner and update execution.
 * Uses page.route to mock API responses for isolation from backend state.
 */
import { test, expect } from '@playwright/test';

const STATUS_READY = JSON.stringify({
  ready: true,
  bedrock: { credentialsFound: false, verified: null, region: 'us-east-1' },
  acp: { connected: false, connections: [] },
  clis: {},
  prerequisites: [],
});

const INSTALLED_PLUGINS = [
  {
    name: 'test-plugin',
    displayName: 'Test Plugin',
    version: '1.0.0',
    hasBundle: true,
    agents: [],
    layout: null,
  },
];

const PLUGIN_UPDATES = [
  {
    name: 'test-plugin',
    currentVersion: '1.0.0',
    latestVersion: '2.0.0',
    source: 'registry',
  },
];

function seedRoutes(page: import('@playwright/test').Page) {
  return Promise.all([
    page.route('**/api/system/status', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: STATUS_READY })),
    page.route('**/api/plugins', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plugins: INSTALLED_PLUGINS }) })),
    page.route('**/api/plugins/check-updates', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ updates: PLUGIN_UPDATES }) })),
    page.route('**/api/agents', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })),
    page.route('**/api/projects', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })),
    page.route('**/api/branding', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })),
    page.route('**/api/auth/status', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true }) })),
    page.route('**/api/config/app', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { defaultModel: 'claude-sonnet', region: 'us-east-1' } }) })),
  ]);
}

test.describe('Plugin Update Flow', () => {
  test('shows update banner when updates are available', async ({ page }) => {
    await seedRoutes(page);
    await page.goto('/plugins');
    await expect(page.getByText('1 update available')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Update All/ })).toBeVisible();
  });

  test('executes plugin update and refreshes list', async ({ page }) => {
    await seedRoutes(page);

    // Mock the update POST to return success
    await page.route('**/api/plugins/test-plugin/update', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, plugin: { name: 'Test Plugin', version: '2.0.0' } }),
      }));

    await page.goto('/plugins');
    await expect(page.getByText('1 update available')).toBeVisible({ timeout: 10000 });

    // After clicking Update All, mock check-updates to return empty (no more updates)
    await page.route('**/api/plugins/check-updates', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ updates: [] }) }));

    await page.getByRole('button', { name: /Update All/ }).click();

    // Success message should appear
    await expect(page.getByText(/Updated Test Plugin/)).toBeVisible({ timeout: 10000 });

    // Banner should disappear after query refresh
    await expect(page.getByText('1 update available')).not.toBeVisible({ timeout: 10000 });
  });

  test('shows error message on update failure', async ({ page }) => {
    await seedRoutes(page);

    await page.route('**/api/plugins/test-plugin/update', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Build failed: syntax error' }),
      }));

    await page.goto('/plugins');
    await expect(page.getByText('1 update available')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Update All/ }).click();

    await expect(page.getByText(/Build failed/)).toBeVisible({ timeout: 10000 });
  });
});
