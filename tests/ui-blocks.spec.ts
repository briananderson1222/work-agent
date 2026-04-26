import { expect, test } from '@playwright/test';
import {
  emitMockOrchestrationEvent,
  installMockOrchestrationEventSource,
  seedActiveChats,
  seedOrchestrationRoutes,
  waitForMockOrchestrationEventSource,
} from './helpers/orchestration';

test.describe('Structured UI blocks', () => {
  test('renders card and table blocks from persisted conversation parts', async ({
    page,
  }) => {
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
    await installMockOrchestrationEventSource(page);
    await seedOrchestrationRoutes(page);
    await page.route('**/api/orchestration/commands', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: null }),
      }),
    );

    await page.goto('/projects/dev/layouts/code?chat=conv-1');
    await page.getByRole('button', { name: 'Expand', exact: true }).click();
    await waitForMockOrchestrationEventSource(page);

    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId: 'session-1',
        createdAt: '2026-04-05T12:00:00.000Z',
        method: 'turn.started',
        turnId: 'turn-1',
      },
    });

    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId: 'session-1',
        createdAt: '2026-04-05T12:00:01.000Z',
        method: 'tool.started',
        turnId: 'turn-1',
        itemId: 'tool-1',
        toolCallId: 'tool-1',
        toolName: 'render_summary',
        arguments: {},
      },
    });

    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId: 'session-1',
        createdAt: '2026-04-05T12:00:02.000Z',
        method: 'tool.completed',
        turnId: 'turn-1',
        itemId: 'tool-1',
        toolCallId: 'tool-1',
        toolName: 'render_summary',
        status: 'success',
        output: {
          uiBlocks: [
            {
              type: 'card',
              title: 'Build Summary',
              body: 'All checks passed',
              fields: [{ label: 'Coverage', value: '98%' }],
            },
            {
              type: 'table',
              title: 'Artifacts',
              columns: ['Name', 'Status'],
              rows: [['report.md', 'generated']],
            },
          ],
        },
      },
    });

    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId: 'session-1',
        createdAt: '2026-04-05T12:00:03.000Z',
        method: 'turn.completed',
        turnId: 'turn-1',
      },
    });

    await expect(page.getByText('Build Summary')).toBeVisible();
    await expect(page.getByText('All checks passed')).toBeVisible();
    await expect(page.getByText('Coverage')).toBeVisible();
    await expect(page.getByText('98%')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Artifacts' }),
    ).toBeVisible();
    await expect(page.getByText('report.md')).toBeVisible();
    await expect(page.getByText('generated')).toBeVisible();
  });
});
