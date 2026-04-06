import { expect, test } from '@playwright/test';
import {
  emitMockOrchestrationEvent,
  installMockOrchestrationEventSource,
  seedActiveChats,
  seedOrchestrationRoutes,
} from './helpers/orchestration';

test.describe('Orchestration Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await installMockOrchestrationEventSource(page);
    await seedOrchestrationRoutes(page);
  });

  test('reuses a restored orchestration session from the snapshot on reload', async ({
    page,
  }) => {
    const commandBodies: any[] = [];
    await seedActiveChats(page, [
      {
        sessionId: 'session-restore',
        conversationId: 'conv-restore',
        agentSlug: 'dev-agent',
        model: 'gpt-5-codex',
        provider: 'codex',
        providerOptions: { reasoningEffort: 'medium' },
        orchestrationSessionStarted: false,
        ephemeralMessages: [],
        inputHistory: [],
      },
    ]);
    await page.route('**/api/orchestration/commands', async (route) => {
      commandBodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: null }),
      });
    });

    await page.goto('/projects/dev/layouts/code?chat=conv-restore');
    await page.getByRole('button', { name: 'Expand', exact: true }).click();
    await emitMockOrchestrationEvent(page, 'orchestration:snapshot', {
      sessions: [
        {
          provider: 'codex',
          threadId: 'session-restore',
          status: 'ready',
          model: 'gpt-5-codex',
        },
      ],
    });

    await page.getByPlaceholder('Type a message...').fill('Resume work');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect.poll(() => commandBodies.length).toBe(1);
    expect(commandBodies[0]).toMatchObject({
      type: 'sendTurn',
      input: {
        threadId: 'session-restore',
      },
    });
  });

  test('fails closed when a persisted session is absent from the snapshot', async ({
    page,
  }) => {
    const commandBodies: any[] = [];
    await seedActiveChats(page, [
      {
        sessionId: 'session-closed',
        conversationId: 'conv-closed',
        agentSlug: 'dev-agent',
        model: 'gpt-5-codex',
        provider: 'codex',
        providerOptions: { reasoningEffort: 'high' },
        orchestrationSessionStarted: true,
        ephemeralMessages: [],
        inputHistory: [],
      },
    ]);
    await page.route('**/api/orchestration/commands', async (route) => {
      commandBodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: null }),
      });
    });

    await page.goto('/projects/dev/layouts/code?chat=conv-closed');
    await page.getByRole('button', { name: 'Expand', exact: true }).click();
    await emitMockOrchestrationEvent(page, 'orchestration:snapshot', {
      sessions: [],
    });

    await page.getByPlaceholder('Type a message...').fill('Restart session');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect.poll(() => commandBodies.length).toBe(2);
    expect(commandBodies[0]).toMatchObject({
      type: 'startSession',
      input: {
        threadId: 'session-closed',
        provider: 'codex',
      },
    });
    expect(commandBodies[1]).toMatchObject({
      type: 'sendTurn',
      input: {
        threadId: 'session-closed',
      },
    });
  });
});
