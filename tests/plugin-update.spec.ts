/**
 * Plugin update flow — verifies update detection banner and update execution.
 * Uses page.route to mock API responses for isolation from backend state.
 */
import { expect, type Page, test } from '@playwright/test';

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
    page.addInitScript(() => {
      localStorage.setItem(
        'stallion-connect-connections',
        JSON.stringify([
          {
            id: 'c1',
            name: 'Dev Server',
            url: window.location.origin,
            lastConnected: Date.now(),
          },
        ]),
      );
      localStorage.setItem('stallion-connect-connections-active', 'c1');
    }),
    page.route('**/api/system/status', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: STATUS_READY,
      }),
    ),
    page.route('**/api/plugins', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plugins: INSTALLED_PLUGINS }),
      }),
    ),
    page.route('**/api/plugins/check-updates', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updates: PLUGIN_UPDATES }),
      }),
    ),
    page.route('**/api/agents', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      }),
    ),
    page.route('**/api/projects', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      }),
    ),
    page.route('**/api/branding', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      }),
    ),
    page.route('**/api/auth/status', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true }),
      }),
    ),
    page.route('**/api/config/app', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { defaultModel: 'claude-sonnet', region: 'us-east-1' },
        }),
      }),
    ),
  ]);
}

async function seedPluginLifecycleRoutes(page: Page) {
  let removed = false;
  let version = '1.0.0';
  let settings = { mode: 'safe' };
  let disabledProviders: string[] = [];

  const plugin = () => ({
    name: 'lifecycle-plugin',
    displayName: 'Lifecycle Plugin',
    version,
    description: 'Exercises plugin detail management',
    hasBundle: true,
    hasSettings: true,
    layout: { slug: 'ops' },
    agents: [{ slug: 'lifecycle-agent' }],
    providers: [{ type: 'voice' }],
    git: { branch: 'main', hash: 'abcdef1234567890' },
  });

  await page.addInitScript(() => {
    localStorage.setItem(
      'stallion-connect-connections',
      JSON.stringify([
        {
          id: 'c1',
          name: 'Dev Server',
          url: window.location.origin,
          lastConnected: Date.now(),
        },
      ]),
    );
    localStorage.setItem('stallion-connect-connections-active', 'c1');
  });

  await page.route('**/api/plugins/check-updates', (route) =>
    route.fulfill({
      json: {
        updates:
          removed || version === '2.0.0'
            ? []
            : [
                {
                  name: 'lifecycle-plugin',
                  currentVersion: '1.0.0',
                  latestVersion: '2.0.0',
                  source: 'registry',
                },
              ],
      },
    }),
  );
  await page.route('**/api/plugins/lifecycle-plugin', (route) => {
    removed = true;
    route.fulfill({ json: { success: true } });
  });
  await page.route('**/api/plugins/lifecycle-plugin/update', (route) => {
    version = '2.0.0';
    route.fulfill({
      json: { success: true, plugin: { name: 'lifecycle-plugin', version } },
    });
  });
  await page.route(
    '**/api/plugins/lifecycle-plugin/settings',
    async (route) => {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        settings = { ...settings, ...body.settings };
        await route.fulfill({ json: { success: true } });
        return;
      }
      await route.fulfill({
        json: {
          schema: [
            {
              key: 'mode',
              label: 'Mode',
              type: 'select',
              options: [
                { label: 'Safe', value: 'safe' },
                { label: 'Fast', value: 'fast' },
              ],
            },
          ],
          values: settings,
        },
      });
    },
  );
  await page.route('**/api/plugins/lifecycle-plugin/providers', (route) =>
    route.fulfill({
      json: {
        providers: [
          {
            type: 'voice',
            module: 'voice-provider',
            layout: 'ops',
            enabled: !disabledProviders.includes('voice'),
          },
        ],
      },
    }),
  );
  await page.route('**/api/plugins/lifecycle-plugin/overrides', (route) => {
    const body = route.request().postDataJSON();
    disabledProviders = body.disabled;
    route.fulfill({ json: { success: true } });
  });
  await page.route('**/api/plugins/lifecycle-plugin/changelog', (route) =>
    route.fulfill({
      json: {
        entries: [
          {
            hash: 'abcdef1234567890',
            short: 'abcdef1',
            subject: 'Improve lifecycle hooks',
            author: 'Stallion',
            date: '2026-04-26T10:00:00.000Z',
          },
        ],
      },
    }),
  );
  await page.route('**/api/plugins', (route) =>
    route.fulfill({ json: { plugins: removed ? [] : [plugin()] } }),
  );
  await page.route('**/api/projects', (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  );
  await page.route('**/api/agents', (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  );
}

test.describe('Plugin Update Flow', () => {
  test('shows update banner when updates are available', async ({ page }) => {
    await seedRoutes(page);
    await page.goto('/plugins');
    await page.evaluate(() => {
      document.querySelector('[data-testid="setup-launcher"]')?.remove();
    });
    await expect(page.getByText('1 update available')).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByRole('button', { name: /Update All/ }),
    ).toBeVisible();
  });

  test('executes plugin update and refreshes list', async ({ page }) => {
    await seedRoutes(page);

    // Mock the update POST to return success
    await page.route('**/api/plugins/test-plugin/update', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          plugin: { name: 'Test Plugin', version: '2.0.0' },
        }),
      }),
    );

    await page.goto('/plugins');
    await page.evaluate(() => {
      document.querySelector('[data-testid="setup-launcher"]')?.remove();
    });
    await expect(page.getByText('1 update available')).toBeVisible({
      timeout: 10000,
    });

    // After clicking Update All, mock check-updates to return empty (no more updates)
    await page.route('**/api/plugins/check-updates', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updates: [] }),
      }),
    );

    await page.getByRole('button', { name: /Update All/ }).click();

    // Success message should appear
    await expect(page.getByText(/Updated Test Plugin/)).toBeVisible({
      timeout: 10000,
    });

    // Banner should disappear after query refresh
    await expect(page.getByText('1 update available')).not.toBeVisible({
      timeout: 10000,
    });
  });

  test('shows error message on update failure', async ({ page }) => {
    await seedRoutes(page);

    await page.route('**/api/plugins/test-plugin/update', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Build failed: syntax error',
        }),
      }),
    );

    await page.goto('/plugins');
    await page.evaluate(() => {
      document.querySelector('[data-testid="setup-launcher"]')?.remove();
    });
    await expect(page.getByText('1 update available')).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole('button', { name: /Update All/ }).click();

    await expect(page.getByText(/Build failed/)).toBeVisible({
      timeout: 10000,
    });
  });

  test('plugin detail covers update, settings, providers, changelog, and remove', async ({
    page,
  }) => {
    await seedPluginLifecycleRoutes(page);
    await page.goto('/plugins');

    await page.getByRole('button', { name: /Lifecycle Plugin/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Lifecycle Plugin' }),
    ).toBeVisible();
    await expect(page.getByText('layout:ops')).toBeVisible();
    await expect(page.getByText('agent:lifecycle-agent')).toBeVisible();
    await expect(page.getByText('provider:voice')).toBeVisible();
    await expect(page.getByText('main@abcdef1')).toBeVisible();

    await page.getByRole('button', { name: 'Update to v2.0.0' }).click();
    await expect(
      page.getByText('Updated lifecycle-plugin to v2.0.0'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Providers (1)' }).click();
    await expect(
      page.locator('.plugins__provider-row').filter({ hasText: 'voice' }),
    ).toBeVisible();
    await page
      .locator('.plugins__provider-row')
      .filter({ hasText: 'voice' })
      .getByRole('switch')
      .click();
    await expect(
      page
        .locator('.plugins__provider-row')
        .filter({ hasText: 'voice' })
        .getByRole('switch'),
    ).toHaveAttribute('aria-checked', 'false');

    await page
      .locator('.plugins__setting-field')
      .filter({ hasText: 'Mode' })
      .locator('select')
      .selectOption('fast');

    await page.getByRole('button', { name: 'Changelog (1)' }).click();
    await expect(page.getByText('Improve lifecycle hooks')).toBeVisible();

    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Remove Plugin')).toBeVisible();
    await page.locator('.plugins__confirm-delete').click();
    await expect(page.getByText('Removed lifecycle-plugin.')).toBeVisible();
  });
});
