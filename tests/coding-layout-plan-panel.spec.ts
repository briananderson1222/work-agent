import { expect, test } from '@playwright/test';
import {
  seedActiveChats,
  seedOrchestrationRoutes,
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
    await seedOrchestrationRoutes(page);
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
});
