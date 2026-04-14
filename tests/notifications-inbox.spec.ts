import { expect, test } from '@playwright/test';

const SEED_STORAGE = `
  window.localStorage.setItem('stallion-connect-connections', JSON.stringify([
    { id: 'c1', name: 'Dev Server', url: 'http://localhost:3242', lastConnected: ${Date.now()} }
  ]));
  window.localStorage.setItem('stallion-connect-connections-active', 'c1');
`;

test.describe('Notifications inbox', () => {
  test('renders approval inbox actions from server-backed notifications', async ({
    page,
  }) => {
    await page.addInitScript(SEED_STORAGE);

    let notifications = [
      {
        id: 'notif-1',
        source: 'approval-inbox',
        category: 'approval-request',
        title: 'Approval needed',
        body: 'Workspace Agent wants to use fs.read.',
        priority: 'high',
        status: 'delivered',
        actions: [
          { id: 'accept', label: 'Allow Once', variant: 'primary' },
          { id: 'decline', label: 'Deny', variant: 'danger' },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    await page.route('**/api/system/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ready: true,
          prerequisites: [],
          acp: { connected: false, connections: [] },
          providers: {
            configured: [
              {
                id: 'local-llm',
                type: 'ollama',
                enabled: true,
                capabilities: ['llm'],
              },
            ],
            detected: { ollama: false, bedrock: false },
          },
          capabilities: {
            chat: {
              ready: true,
              source: 'local-llm',
            },
          },
          clis: {},
        }),
      }),
    );

    await page.route('**/notifications', async (route) => {
      if (route.request().resourceType() === 'document') {
        await route.fallback();
        return;
      }
      if (route.request().method() === 'DELETE') {
        notifications = [];
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: notifications,
        }),
      });
    });

    await page.route(
      '**/notifications/notif-1/action/accept',
      async (route) => {
        notifications = [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      },
    );

    await page.goto('/notifications');

    await expect(page.getByText('Approval needed')).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole('button', { name: 'Allow Once' }).click();
    await expect(page.getByText('Approval needed')).toHaveCount(0);
  });
});
