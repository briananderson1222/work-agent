import { expect, test } from '@playwright/test';
import {
  dismissSetupLauncher,
  seedActiveChats,
  seedOrchestrationRoutes,
} from './helpers/orchestration';

test.describe('Orchestration Execution Settings', () => {
  test.beforeEach(async ({ page }) => {
    await seedActiveChats(page, [
      {
        sessionId: 'session-1',
        conversationId: 'conv-1',
        agentSlug: 'dev-agent',
        model: 'claude-sonnet',
        provider: 'bedrock',
        providerOptions: {},
        orchestrationSessionStarted: false,
        ephemeralMessages: [],
        inputHistory: [],
      },
    ]);
    await seedOrchestrationRoutes(page);
    await page.route('**/api/orchestration/commands', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: null }),
      }),
    );
  });

  test('shows the active execution summary without triggering onboarding', async ({
    page,
  }) => {
    await page.goto('/projects/dev/layouts/code?chat=conv-1');
    await dismissSetupLauncher(page);

    await expect(page.getByTestId('setup-launcher')).toHaveCount(0);

    await page.getByTitle('Chat settings').click();
    await expect(
      page.getByRole('heading', { name: 'Chat Settings' }),
    ).toBeVisible();
    await expect(
      page.getByRole('switch', { name: 'Show reasoning' }),
    ).toBeVisible();
  });

  test('round-trips persisted provider options through orchestration commands', async ({
    page,
  }) => {
    const commandBodies: any[] = [];
    await seedActiveChats(page, [
      {
        sessionId: 'session-1',
        conversationId: 'conv-1',
        agentSlug: 'dev-agent',
        model: 'claude-sonnet',
        provider: 'codex',
        providerOptions: {
          reasoningEffort: 'xhigh',
          fastMode: true,
        },
        orchestrationSessionStarted: false,
        ephemeralMessages: [],
        inputHistory: [],
      },
    ]);
    await page.unroute('**/api/orchestration/commands');
    await page.route('**/api/orchestration/commands', async (route) => {
      commandBodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: null }),
      });
    });

    await page.goto('/projects/dev/layouts/code?chat=conv-1');
    await dismissSetupLauncher(page);
    await page.getByRole('button', { name: 'Expand', exact: true }).click();

    await page.getByPlaceholder('Type a message...').fill('Inspect the repo');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect.poll(() => commandBodies.length).toBe(2);
    expect(commandBodies[0]).toMatchObject({
      type: 'startSession',
      input: {
        provider: 'codex',
        modelOptions: {
          reasoningEffort: 'xhigh',
          fastMode: true,
        },
      },
    });
    expect(commandBodies[1]).toMatchObject({
      type: 'sendTurn',
      input: {
        modelOptions: {
          reasoningEffort: 'xhigh',
          fastMode: true,
        },
      },
    });
  });
});
