import { expect, test } from '@playwright/test';

const SEED_STORAGE = `
  window.localStorage.setItem('stallion-connect-connections', JSON.stringify([
    { id: 'c1', name: 'Dev Server', url: 'http://localhost:3242', lastConnected: ${Date.now()} }
  ]));
  window.localStorage.setItem('stallion-connect-connections-active', 'c1');
`;

test.describe('Onboarding Setup Launcher', () => {
  test('shows non-chat guidance when only vectordb providers are configured', async ({
    page,
  }) => {
    await page.addInitScript(SEED_STORAGE);

    await page.route('**/api/system/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ready: false,
          prerequisites: [],
          bedrock: {
            credentialsFound: false,
            verified: null,
            region: null,
          },
          acp: { connected: false, connections: [] },
          providers: {
            configured: [
              {
                id: 'lancedb-builtin',
                type: 'lancedb',
                enabled: true,
                capabilities: ['vectordb'],
              },
            ],
            detected: {
              ollama: false,
              bedrock: false,
            },
          },
          clis: {},
        }),
      }),
    );

    await page.goto('/');

    await expect(page.getByTestId('setup-launcher')).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByText('No chat-capable connection is enabled'),
    ).toBeVisible();
    await expect(page.getByText('Configured: lancedb')).toBeVisible();
  });

  test('shows detection-led guidance when Ollama is reachable but not configured', async ({
    page,
  }) => {
    await page.addInitScript(SEED_STORAGE);

    await page.route('**/api/system/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ready: true,
          prerequisites: [],
          bedrock: {
            credentialsFound: false,
            verified: null,
            region: null,
          },
          acp: { connected: false, connections: [] },
          providers: {
            configured: [],
            detected: {
              ollama: true,
              bedrock: false,
            },
          },
          clis: {},
        }),
      }),
    );

    await page.goto('/');

    await expect(page.getByTestId('setup-launcher')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('Ollama detected locally')).toBeVisible();
    await expect(page.getByText('Detected: Ollama')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Review Connections' }),
    ).toBeVisible();
  });
});
