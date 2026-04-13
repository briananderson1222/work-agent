import { expect, test } from '@playwright/test';

const SEED_STORAGE = `
  window.localStorage.setItem('stallion-connect-connections', JSON.stringify([
    { id: 'c1', name: 'Dev Server', url: 'http://localhost:3242', lastConnected: ${Date.now()} }
  ]));
  window.localStorage.setItem('stallion-connect-connections-active', 'c1');
`;

test.describe('Onboarding Setup Launcher', () => {
  test('shows generic setup guidance when only vectordb providers are configured', async ({
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
            configuredChatReady: false,
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
          recommendation: {
            code: 'unconfigured',
            type: 'connections',
            actionLabel: 'Open Connections',
            title: 'No usable AI path is configured yet',
            detail:
              'Start Ollama locally or add a provider/runtime connection to make Stallion ready for first-run chat.',
          },
          clis: {},
        }),
      }),
    );

    await page.goto('/');

    await expect(page.getByTestId('setup-launcher')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('No AI connection configured yet')).toBeVisible();
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
            configuredChatReady: false,
            configured: [],
            detected: {
              ollama: true,
              bedrock: false,
            },
          },
          recommendation: {
            code: 'detected-ollama',
            type: 'providers',
            actionLabel: 'Add Ollama connection',
            title: 'Ollama is reachable locally',
            detail:
              'Create a model connection for the detected local Ollama server to make first-run chat explicit.',
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

  test('hides the setup launcher when Ollama is already configured', async ({
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
            configuredChatReady: true,
            configured: [
              {
                id: 'ollama-local',
                type: 'ollama',
                enabled: true,
                capabilities: ['llm', 'embedding'],
              },
            ],
            detected: {
              ollama: true,
              bedrock: false,
            },
          },
          recommendation: {
            code: 'configured-chat-ready',
            type: 'providers',
            actionLabel: 'Review model connections',
            title: 'A chat-capable model connection is already configured',
            detail:
              'Stallion can already route chat through ollama. Review connections if you want to change the default.',
          },
          clis: {},
        }),
      }),
    );

    await page.goto('/');

    await expect(page.getByTestId('setup-launcher')).toHaveCount(0);
  });
});
