import { expect, test } from '@playwright/test';
import {
  emitMockOrchestrationEvent,
  installMockOrchestrationEventSource,
  seedActiveChats,
  seedOrchestrationRoutes,
} from './helpers/orchestration';

test.describe('Orchestration Chat Flow', () => {
  test.beforeEach(async ({ page }) => {
    await installMockOrchestrationEventSource(page);
    await seedActiveChats(page, [
      {
        sessionId: 'session-1',
        conversationId: 'conv-1',
        agentSlug: 'dev-agent',
        model: 'claude-sonnet',
        provider: 'codex',
        providerOptions: {
          reasoningEffort: 'high',
          fastMode: false,
        },
        orchestrationSessionStarted: false,
        ephemeralMessages: [],
        inputHistory: [],
      },
    ]);
    await seedOrchestrationRoutes(page);
  });

  test('renders transcript, tool activity, and approval UI from canonical events', async ({
    page,
  }) => {
    const commandBodies: any[] = [];
    await page.route('**/api/orchestration/commands', async (route) => {
      const payload = route.request().postDataJSON();
      commandBodies.push(payload);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: null }),
      });
    });

    await page.goto('/projects/dev/layouts/code?chat=conv-1');
    await page.getByRole('button', { name: 'Expand', exact: true }).click();
    await page.getByPlaceholder('Type a message...').fill('Inspect the repo');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect.poll(() => commandBodies.length).toBe(2);

    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId: 'session-1',
        createdAt: '2026-04-05T12:00:00.000Z',
        method: 'session.started',
        sessionId: 'session-1',
      },
    });
    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId: 'session-1',
        createdAt: '2026-04-05T12:00:01.000Z',
        method: 'session.configured',
        sessionId: 'session-1',
      },
    });
    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId: 'session-1',
        createdAt: '2026-04-05T12:00:02.000Z',
        method: 'turn.started',
        turnId: 'turn-1',
        prompt: 'Inspect the repo',
      },
    });
    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId: 'session-1',
        createdAt: '2026-04-05T12:00:03.000Z',
        method: 'tool.started',
        turnId: 'turn-1',
        itemId: 'tool-1',
        toolCallId: 'tool-1',
        toolName: 'shell_exec',
        arguments: { command: 'ls', cwd: '/tmp/test' },
      },
    });
    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId: 'session-1',
        createdAt: '2026-04-05T12:00:04.000Z',
        method: 'tool.progress',
        turnId: 'turn-1',
        itemId: 'tool-1',
        toolCallId: 'tool-1',
        message: 'listing files',
      },
    });
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

    await expect(page.getByText('Tool Approval Request')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Allow Once' })).toBeVisible();
    await page.getByRole('button', { name: 'Allow Once' }).click();

    await expect
      .poll(() => commandBodies.some((body) => body.type === 'respondToRequest'))
      .toBe(true);

    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId: 'session-1',
        createdAt: '2026-04-05T12:00:06.000Z',
        method: 'request.resolved',
        requestId: 'req-1',
        status: 'approved',
      },
    });
    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId: 'session-1',
        createdAt: '2026-04-05T12:00:07.000Z',
        method: 'tool.completed',
        turnId: 'turn-1',
        itemId: 'tool-1',
        toolCallId: 'tool-1',
        toolName: 'shell_exec',
        status: 'success',
        output: {
          output: 'file-a',
          exitCode: 0,
        },
      },
    });
    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId: 'session-1',
        createdAt: '2026-04-05T12:00:08.000Z',
        method: 'content.text-delta',
        turnId: 'turn-1',
        itemId: 'msg-1',
        delta: 'Repo looks healthy.',
      },
    });
    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId: 'session-1',
        createdAt: '2026-04-05T12:00:09.000Z',
        method: 'turn.completed',
        turnId: 'turn-1',
        finishReason: 'stop',
        outputText: 'Repo looks healthy.',
      },
    });

    await expect(page.getByText('Repo looks healthy.')).toBeVisible();
    await expect(page.getByText('shell_exec')).toBeVisible();
    await expect(page.getByText('Awaiting tool approval (1)')).not.toBeVisible();
  });
});
