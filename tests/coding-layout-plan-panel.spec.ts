import { expect, test } from '@playwright/test';
import {
  emitMockOrchestrationEvent,
  installMockOrchestrationEventSource,
  seedActiveChats,
  seedOrchestrationRoutes,
  waitForMockOrchestrationEventSource,
} from './helpers/orchestration';

test.describe('Coding Layout Plan Panel', () => {
  test.beforeEach(async ({ page }) => {
    await seedActiveChats(page, [
      {
        sessionId: 'session-1',
        conversationId: 'conv-1',
        agentSlug: 'dev-agent',
        model: 'claude-sonnet',
        provider: 'codex',
        providerOptions: {},
        projectSlug: 'dev',
        projectName: 'Dev',
        orchestrationSessionStarted: true,
        inputHistory: [],
        ephemeralMessages: [],
        currentModeId: 'plan',
        planArtifact: {
          source: 'reasoning',
          rawText:
            '## Shipping plan\n\n✅ Capture requirements\n⏳ Build workflow panel\n⬜ Verify coding layout visibility',
          steps: [
            { content: 'Capture requirements', status: 'completed' },
            { content: 'Build workflow panel', status: 'in_progress' },
            { content: 'Verify coding layout visibility', status: 'pending' },
          ],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    ]);
    await installMockOrchestrationEventSource(page);
    await seedOrchestrationRoutes(page);
    await page.route('**/api/fs/browse**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              name: 'src',
              path: '/tmp/test/src',
              type: 'directory',
              children: [
                {
                  name: 'app.ts',
                  path: '/tmp/test/src/app.ts',
                  type: 'file',
                },
              ],
            },
          ],
        }),
      }),
    );
    await page.route('**/api/coding/diff**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: '@@ -1 +1 @@\n-console.log("old")\n+console.log("new")\n',
        }),
      }),
    );
    await page.goto('/projects/dev/layouts/code?chat=conv-1');
  });

  test('renders the workflow plan panel from cached plan artifacts', async ({
    page,
  }) => {
    const planPanel = page.locator('.workflow-plan-panel');

    await expect(page.getByTestId('setup-launcher')).toHaveCount(0);
    await expect(planPanel.getByText('Workflow plan')).toBeVisible();
    await expect(
      planPanel.getByRole('heading', { name: 'Shipping plan' }),
    ).toBeVisible();
    await expect(planPanel.getByText('Linked to Dev Agent Chat')).toBeVisible();
    await expect(planPanel.getByText('Active', { exact: true })).toBeVisible();
    await expect(
      planPanel.getByText('Completed', { exact: true }),
    ).toBeVisible();
    await expect(planPanel.getByText('Pending', { exact: true })).toBeVisible();
    await expect(planPanel.getByText('Build workflow panel')).toBeVisible();
    await expect(
      planPanel.getByText('Verify coding layout visibility'),
    ).toBeVisible();
  });

  test('surfaces runtime approval state and explicit context handoff', async ({
    page,
  }) => {
    const planPanel = page.locator('.workflow-plan-panel');

    await waitForMockOrchestrationEventSource(page);
    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId: 'session-1',
        createdAt: '2026-04-05T12:00:05.000Z',
        method: 'request.opened',
        requestId: 'req-1',
        requestType: 'permission',
        title: 'Approve permissions',
        description: 'Needs network access',
        payload: {
          toolName: 'shell_exec',
        },
      },
    });

    await expect(planPanel.getByText('Approval required (1)')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'New Chat with Context' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'New Chat with Context' }).click();
    const modal = page.locator('.new-chat-modal');
    await expect(modal.getByText('Coding context handoff')).toBeVisible();
    await expect(
      modal.getByRole('button', { name: /Working dir .*\/tmp\/test/ }),
    ).toBeVisible();
    await expect(
      modal.getByRole('button', { name: /Surface .*Git diff view/ }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: /Codex Runtime .*Codex app-server runtime/ })
      .click();

    const composer = page.getByPlaceholder(/Type a message/);
    await expect(composer).toHaveValue(/Coding context for this chat:/);
    await expect(composer).toHaveValue(/Working directory: \/tmp\/test/);
    await expect(composer).toHaveValue(/Current surface: Git diff view/);
  });
});
