import { expect, test } from '@playwright/test';
import {
  seedActiveChats,
  seedOrchestrationRoutes,
} from './helpers/orchestration';

test.describe('Orchestration Provider Picker', () => {
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

  test('switches between Bedrock, Claude, and Codex provider controls', async ({
    page,
  }) => {
    await page.goto('/projects/dev/layouts/code?chat=conv-1');
    await page.waitForTimeout(1500);

    await page.getByTitle('Chat settings').click();
    await expect(page.getByText('Provider', { exact: true })).toBeVisible();

    const providerSelect = page.locator('select').first();
    await expect(providerSelect).toHaveValue('bedrock');

    await providerSelect.selectOption('claude');
    await expect(providerSelect).toHaveValue('claude');
    await expect(page.getByText('Enable thinking')).toBeVisible();
    await expect(page.locator('select').nth(1)).toHaveValue('medium');

    await providerSelect.selectOption('codex');
    await expect(providerSelect).toHaveValue('codex');
    await expect(page.getByText('Reasoning Effort')).toBeVisible();
    await expect(page.getByText('Fast mode')).toBeVisible();
  });

  test('shows missing prerequisite state and persists provider options across reloads', async ({
    page,
  }) => {
    await page.unroute('**/api/orchestration/providers');
    await seedOrchestrationRoutes(page, {
      providerSummaries: [
        { provider: 'bedrock', activeSessions: 0, prerequisites: [] },
        {
          provider: 'claude',
          activeSessions: 0,
          prerequisites: [{ name: 'ANTHROPIC_API_KEY', status: 'installed' }],
        },
        {
          provider: 'codex',
          activeSessions: 0,
          prerequisites: [{ name: 'OPENAI_API_KEY', status: 'missing' }],
        },
      ],
    });

    await page.goto('/projects/dev/layouts/code?chat=conv-1');
    await page.getByTitle('Chat settings').click();

    const providerSelect = page.locator('select').first();
    await providerSelect.selectOption('codex');
    await expect(page.getByText('OPENAI_API_KEY: missing')).toBeVisible();

    const reasoningSelect = page.locator('select').nth(1);
    await reasoningSelect.selectOption('high');
    await page.getByText('Fast mode').click();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForTimeout(400);

    const storedChats = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('activeChats') || '[]'),
    );
    expect(storedChats[0]).toMatchObject({
      provider: 'codex',
      providerOptions: {
        reasoningEffort: 'high',
      },
    });
  });

  test('round-trips provider options through orchestration commands', async ({
    page,
  }) => {
    const commandBodies: any[] = [];
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
    await page.getByTitle('Chat settings').click();

    const providerSelect = page.locator('select').first();
    await providerSelect.selectOption('codex');
    await page.locator('select').nth(1).selectOption('xhigh');
    await page.getByText('Fast mode').click();
    await page.getByRole('button', { name: 'Done' }).click();
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
