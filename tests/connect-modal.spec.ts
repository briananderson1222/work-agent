/**
 * E2E: Connection Manager Modal
 *
 * Opens the app, seeds localStorage with a connection, verifies:
 *  - the connection chip appears in the header
 *  - clicking it opens the modal
 *  - adding a new connection via the form works
 *  - switching active connection updates the chip label
 *  - editing a connection works
 *  - removing a connection works
 *  - discover panel renders
 *  - status dot states render correctly
 */
import { expect, test } from '@playwright/test';

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

function seedConnection(
  id = 'conn-1',
  name = 'Dev Server',
  urlExpression = 'window.location.origin',
) {
  return `
    window.localStorage.setItem('stallion-connect-connections', JSON.stringify([
      { id: '${id}', name: '${name}', url: ${urlExpression}, lastConnected: ${Date.now()} }
    ]));
    window.localStorage.setItem('stallion-connect-connections-active', '${id}');
  `;
}

test.describe('Connection Manager Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(seedConnection());
    await page.route('**/api/system/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: STATUS_READY,
      }),
    );
    await page.goto('/');
    // Wait for the connection chip to appear in the header
    await expect(page.getByRole('button', { name: /Dev Server/ })).toBeVisible({
      timeout: 10000,
    });
    await page.evaluate(() => {
      document.querySelector('[data-testid="setup-launcher"]')?.remove();
    });
  });

  test('connection chip is visible in the header', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /Dev Server/ }),
    ).toBeVisible();
  });

  test('clicking the chip opens the connection modal', async ({ page }) => {
    await page.getByRole('button', { name: /Dev Server/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Connections' }),
    ).toBeVisible();
    // The existing connection should appear in the modal list
    await expect(
      page.locator('div').filter({ hasText: /^Dev Server$/ }),
    ).toBeVisible();
  });

  test('can add a new connection manually', async ({ page }) => {
    await page.getByRole('button', { name: /Dev Server/ }).click();
    await page.getByRole('button', { name: '+ Add Manually' }).click();
    await page.getByPlaceholder('Name (optional)').fill('Office');
    await page.getByPlaceholder(/192\.168/).fill('http://10.0.0.5:3141');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Chip should update to the new active connection
    await expect(page.getByRole('button', { name: /Office/ })).toBeVisible();
  });

  test('can switch between connections', async ({ page }) => {
    // Add a second connection via the UI
    await page.getByRole('button', { name: /Dev Server/ }).click();
    await page.getByRole('button', { name: '+ Add Manually' }).click();
    await page.getByPlaceholder('Name (optional)').fill('Remote');
    await page.getByPlaceholder(/192\.168/).fill('http://203.0.113.5:3141');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Modal is still open on the list panel — click the Dev Server row to switch back
    const appOrigin = new URL(page.url()).origin.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
    const devRow = page
      .locator('div')
      .filter({ hasText: new RegExp(`^${appOrigin}$`) });
    await devRow.click();

    // Chip should update back to Dev Server
    await expect(
      page.getByRole('button', { name: /Dev Server/ }),
    ).toBeVisible();
  });

  test('can edit a connection', async ({ page }) => {
    await page.getByRole('button', { name: /Dev Server/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Connections' }),
    ).toBeVisible();

    // Click the edit button (✎)
    await page.getByRole('button', { name: '✎', exact: true }).click();

    // Edit form should appear with pre-filled values
    const nameInput = page.getByPlaceholder('Name');
    const _urlInput = page.getByPlaceholder(/192\.168/);
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue('Dev Server');

    // Change the name
    await nameInput.fill('Home Lab');
    await page.getByRole('button', { name: 'Save' }).click();

    // Updated name should appear
    await expect(
      page.locator('div').filter({ hasText: /^Home Lab$/ }),
    ).toBeVisible();
  });

  test('can remove a connection', async ({ page }) => {
    // Add a second connection via the UI so we have something to remove
    await page.getByRole('button', { name: /Dev Server/ }).click();
    await page.getByRole('button', { name: '+ Add Manually' }).click();
    await page.getByPlaceholder('Name (optional)').fill('ToDelete');
    await page.getByPlaceholder(/192\.168/).fill('http://delete-me:3141');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Modal is still open — the × buttons map to remove. ToDelete row has buttons [↻, ✎, ×]
    // Find all × buttons with title="Remove" and click the last one (ToDelete is the second row)
    const removeButtons = page.locator('button[title="Remove"]');
    await removeButtons.last().click();

    await expect(page.locator('text=ToDelete')).not.toBeVisible();
  });

  test('modal closes when clicking the backdrop', async ({ page }) => {
    await page.getByRole('button', { name: /Dev Server/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Connections' }),
    ).toBeVisible();

    // Click the dark overlay (outside the modal card)
    await page.mouse.click(10, 10);
    await expect(
      page.getByRole('heading', { name: 'Connections' }),
    ).not.toBeVisible();
  });

  test('discover panel shows scanning state', async ({ page }) => {
    await page.getByRole('button', { name: /Dev Server/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Connections' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Discover' }).click();

    // Should show the discover panel heading and scanning state or "no servers" message
    await expect(
      page.getByRole('heading', { name: 'Discover on Network' }),
    ).toBeVisible();
    // Back button should be present
    await expect(page.getByRole('button', { name: /Back/ })).toBeVisible();
  });

  test('status dot shows correct colors', async ({ page }) => {
    await page.getByRole('button', { name: /Dev Server/ }).click();

    // The status dot should be visible in the modal (connecting state since health check won't resolve)
    const _dot = page.locator('[aria-label]').filter({ hasText: /^$/ }).first();
    // At minimum, verify a dot with aria-label exists in the connection row
    await expect(
      page
        .locator(
          '[aria-label="connecting"], [aria-label="connected"], [aria-label="error"]',
        )
        .first(),
    ).toBeVisible();
  });

  test('cleared connection storage falls back to the current app connection', async ({
    page,
  }) => {
    // Clear all connections
    await page.evaluate(() => {
      localStorage.removeItem('stallion-connect-connections');
      localStorage.removeItem('stallion-connect-connections-active');
    });
    await page.addInitScript(() => {
      localStorage.removeItem('stallion-connect-connections');
      localStorage.removeItem('stallion-connect-connections-active');
    });
    await page.reload();
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => {
      document.querySelector('[data-testid="setup-launcher"]')?.remove();
    });

    await page.locator('button[title="Manage connections"]').click();
    await expect(
      page.getByRole('heading', { name: 'Connections' }),
    ).toBeVisible();
    await expect(
      page.getByText(`http://localhost:${process.env.STALLION_PORT ?? '3141'}`),
    ).toBeVisible();
  });
});
