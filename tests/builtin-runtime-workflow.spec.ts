import { expect, test } from '@playwright/test';
import {
  emitMockOrchestrationEvent,
  installMockOrchestrationEventSource,
  waitForMockOrchestrationEventSource,
} from './helpers/orchestration';

const PROJECT = {
  id: 'p-default',
  slug: 'default',
  name: 'Default',
  description: 'Default project',
  hasWorkingDirectory: false,
  layoutCount: 0,
  hasKnowledge: false,
};

const AGENTS = [
  {
    slug: '__runtime:claude-runtime',
    name: 'Claude Runtime',
    description:
      'Direct chat using Claude Runtime with project working directory context when available.',
    source: 'local',
    execution: {
      runtimeConnectionId: 'claude-runtime',
      modelId: 'claude-sonnet-4-20250514',
    },
  },
  {
    slug: '__runtime:codex-runtime',
    name: 'Codex Runtime',
    description:
      'Direct chat using Codex Runtime with project working directory context when available.',
    source: 'local',
    execution: {
      runtimeConnectionId: 'codex-runtime',
      modelId: 'gpt-5-codex',
    },
  },
];

function json(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

async function seedRuntimeRoutes(
  page: import('@playwright/test').Page,
  commandBodies: any[] = [],
) {
  const runtimeHistory = {
    '__runtime:claude-runtime': [
      {
        id: 'conv-claude-1',
        title: 'Claude history',
        createdAt: '2026-04-12T00:00:00Z',
        updatedAt: '2026-04-12T00:01:00Z',
        messageCount: 2,
      },
    ],
    '__runtime:codex-runtime': [
      {
        id: 'conv-codex-1',
        title: 'Codex history',
        createdAt: '2026-04-12T00:00:00Z',
        updatedAt: '2026-04-12T00:01:00Z',
        messageCount: 2,
      },
    ],
  } as Record<string, any[]>;

  const runtimeMessages = {
    'conv-claude-1': [
      {
        role: 'user',
        parts: [{ type: 'text', text: 'hello claude' }],
        metadata: { timestamp: '2026-04-12T00:00:00Z' },
      },
      {
        role: 'assistant',
        parts: [{ type: 'text', text: 'Claude says hi' }],
        metadata: { timestamp: '2026-04-12T00:00:01Z' },
      },
    ],
    'conv-codex-1': [
      {
        role: 'user',
        parts: [{ type: 'text', text: 'hello codex' }],
        metadata: { timestamp: '2026-04-12T00:00:00Z' },
      },
      {
        role: 'assistant',
        parts: [{ type: 'text', text: 'Codex says hi' }],
        metadata: { timestamp: '2026-04-12T00:00:01Z' },
      },
    ],
  } as Record<string, any[]>;

  await Promise.all([
    page.route('**/api/system/status', (route) =>
      route.fulfill(
        json({
          ready: true,
          acp: { connected: false, connections: [] },
          providers: {
            configured: [],
            detected: { ollama: false, bedrock: false },
          },
          capabilities: {
            chat: { ready: true, source: 'codex-runtime' },
            runtime: { ready: true, source: 'codex-runtime' },
            knowledge: { ready: false, source: null },
            acp: { ready: false, source: null },
          },
          recommendation: null,
          prerequisites: [],
          clis: { codex: true, claude: true, 'kiro-cli': false },
        }),
      ),
    ),
    page.route('**/api/system/capabilities', (route) =>
      route.fulfill(
        json({
          voice: { stt: [], tts: [] },
          context: { providers: [] },
        }),
      ),
    ),
    page.route('**/api/models/capabilities', (route) =>
      route.fulfill(json({ success: true, data: [] })),
    ),
    page.route('**/api/projects', (route) =>
      route.fulfill(json({ success: true, data: [PROJECT] })),
    ),
    page.route('**/api/projects/default', (route) =>
      route.fulfill(
        json({
          success: true,
          data: {
            ...PROJECT,
            agents: [],
            createdAt: '2026-04-12T00:00:00Z',
            updatedAt: '2026-04-12T00:00:00Z',
          },
        }),
      ),
    ),
    page.route('**/api/agents', (route) =>
      route.fulfill(json({ success: true, data: AGENTS })),
    ),
    page.route('**/api/connections/runtimes', (route) =>
      route.fulfill(
        json({
          success: true,
          data: [
            {
              id: 'claude-runtime',
              kind: 'runtime',
              type: 'claude-runtime',
              name: 'Claude Runtime',
              enabled: true,
              capabilities: ['agent-runtime'],
              config: { defaultModel: 'claude-sonnet-4-20250514' },
              status: 'ready',
              prerequisites: [],
            },
            {
              id: 'codex-runtime',
              kind: 'runtime',
              type: 'codex-runtime',
              name: 'Codex Runtime',
              enabled: true,
              capabilities: ['agent-runtime'],
              config: { defaultModel: 'gpt-5-codex' },
              status: 'ready',
              prerequisites: [],
            },
          ],
        }),
      ),
    ),
    page.route('**/api/connections/models', (route) =>
      route.fulfill(json({ success: true, data: [] })),
    ),
    page.route('**/config/app', (route) =>
      route.fulfill(
        json({
          success: true,
          data: {
            defaultModel: 'claude-sonnet-4-20250514',
          },
        }),
      ),
    ),
    page.route('**/api/orchestration/providers', (route) =>
      route.fulfill(
        json({
          success: true,
          data: [
            { provider: 'claude', activeSessions: 0, prerequisites: [] },
            { provider: 'codex', activeSessions: 0, prerequisites: [] },
          ],
        }),
      ),
    ),
    page.route('**/api/orchestration/commands', async (route) => {
      const payload = route.request().postDataJSON();
      commandBodies.push(payload);
      await route.fulfill(
        json({
          success: true,
          data: {
            ok: true,
            echoedType: payload?.type,
          },
        }),
      );
    }),
    page.route('**/agents/*/conversations', (route) => {
      const match = route
        .request()
        .url()
        .match(/\/agents\/([^/]+)\/conversations$/);
      const slug = match?.[1] ? decodeURIComponent(match[1]) : '';
      route.fulfill(json({ success: true, data: runtimeHistory[slug] || [] }));
    }),
    page.route('**/agents/*/conversations/*/messages', (route) => {
      const match = route
        .request()
        .url()
        .match(/conversations\/([^/]+)\/messages/);
      const conversationId = match?.[1] ? decodeURIComponent(match[1]) : '';
      route.fulfill(
        json({ success: true, data: runtimeMessages[conversationId] || [] }),
      );
    }),
    page.route('**/api/conversations**', (route) =>
      route.fulfill(json({ conversations: [] })),
    ),
    page.route('**/events', (route) => route.abort()),
  ]);
}

async function openRuntimeSession(
  page: import('@playwright/test').Page,
  runtimeName: 'Claude Runtime' | 'Codex Runtime',
) {
  await page.addInitScript(() => {
    localStorage.setItem('lastProject', 'default');
    localStorage.removeItem('recentAgents');
  });
  await page.goto('/?dock=open');
  await expect(
    page.locator('.chat-dock__tab-actions .chat-dock__new').nth(1),
  ).toBeVisible({ timeout: 15_000 });
  await dismissSetupLauncher(page);
  await page
    .locator('.chat-dock__tab-actions .chat-dock__new')
    .nth(1)
    .dispatchEvent('click');
  await expect(
    page.locator('.new-chat-modal__agent', { hasText: runtimeName }),
  ).toBeVisible({ timeout: 10_000 });
  await page
    .locator('.new-chat-modal__agent', { hasText: runtimeName })
    .dispatchEvent('click');
  await expect(page.locator('.chat-dock__tab-list')).toContainText(runtimeName);
}

async function dismissSetupLauncher(page: import('@playwright/test').Page) {
  const continueBtn = page.getByRole('button', {
    name: 'Continue Without Setup',
  });
  if (await continueBtn.isVisible().catch(() => false)) {
    await continueBtn.click({ force: true });
    await expect(continueBtn).not.toBeVisible({ timeout: 5_000 });
  }
}

test.describe('Built-in runtime chat workflows', () => {
  test('opens a Claude runtime session from New Chat', async ({ page }) => {
    await seedRuntimeRoutes(page);
    await openRuntimeSession(page, 'Claude Runtime');

    await expect(page.locator('.chat-dock__tab-list')).toContainText(
      'Claude Runtime',
    );
    await expect(page.locator('body')).toContainText('Default');
  });

  test('opens a Codex runtime session from New Chat', async ({ page }) => {
    await seedRuntimeRoutes(page);
    await openRuntimeSession(page, 'Codex Runtime');

    await expect(page.locator('.chat-dock__tab-list')).toContainText(
      'Codex Runtime',
    );
    await expect(page.locator('body')).toContainText('Default');
  });

  test('reopens Claude runtime history from the history panel', async ({
    page,
  }) => {
    await seedRuntimeRoutes(page);
    await page.addInitScript(() => {
      localStorage.setItem('lastProject', 'default');
      localStorage.removeItem('recentAgents');
    });
    await page.goto('/?dock=open');
    await expect(page.locator('button.chat-dock__history-toggle')).toBeVisible({
      timeout: 15_000,
    });
    await dismissSetupLauncher(page);

    await page
      .locator('button.chat-dock__history-toggle')
      .click({ force: true });
    await expect(page.locator('.conversation-history')).toContainText(
      'Claude history',
    );
    await page
      .locator('.session-item__content', { hasText: 'Claude history' })
      .click();

    await expect(page.locator('.chat-dock__tab-list')).toContainText(
      'Claude Runtime',
    );
    await expect(page.locator('body')).toContainText('Claude says hi');
  });

  test('reopens Codex runtime history from the history panel', async ({
    page,
  }) => {
    await seedRuntimeRoutes(page);
    await page.addInitScript(() => {
      localStorage.setItem('lastProject', 'default');
      localStorage.removeItem('recentAgents');
    });
    await page.goto('/?dock=open');
    await expect(page.locator('button.chat-dock__history-toggle')).toBeVisible({
      timeout: 15_000,
    });
    await dismissSetupLauncher(page);

    await page
      .locator('button.chat-dock__history-toggle')
      .click({ force: true });
    await expect(page.locator('.conversation-history')).toContainText(
      'Codex history',
    );
    await page
      .locator('.session-item__content', { hasText: 'Codex history' })
      .click();

    await expect(page.locator('.chat-dock__tab-list')).toContainText(
      'Codex Runtime',
    );
    await expect(page.locator('body')).toContainText('Codex says hi');
  });

  test('streams a Claude runtime reply end-to-end', async ({ page }) => {
    const commandBodies: any[] = [];
    await installMockOrchestrationEventSource(page);
    await seedRuntimeRoutes(page, commandBodies);
    await openRuntimeSession(page, 'Claude Runtime');
    await waitForMockOrchestrationEventSource(page);

    const textarea = page.locator('textarea[placeholder*="Type a message"]');
    await textarea.fill('hello claude');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect
      .poll(() => commandBodies.some((body) => body.type === 'sendTurn'))
      .toBe(true);

    const threadId = commandBodies.find((body) => body.type === 'sendTurn')
      .input.threadId;
    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'claude',
        threadId,
        createdAt: '2026-04-12T00:00:00.000Z',
        method: 'session.started',
        sessionId: threadId,
      },
    });
    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'claude',
        threadId,
        createdAt: '2026-04-12T00:00:01.000Z',
        method: 'content.text-delta',
        itemId: 'item-1',
        delta: 'Claude says hi',
      },
    });
    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'claude',
        threadId,
        createdAt: '2026-04-12T00:00:02.000Z',
        method: 'turn.completed',
        turnId: 'turn-1',
      },
    });

    await expect(page.locator('body')).toContainText('Claude says hi');
  });

  test('streams a Codex runtime reply end-to-end', async ({ page }) => {
    const commandBodies: any[] = [];
    await installMockOrchestrationEventSource(page);
    await seedRuntimeRoutes(page, commandBodies);
    await openRuntimeSession(page, 'Codex Runtime');
    await waitForMockOrchestrationEventSource(page);

    const textarea = page.locator('textarea[placeholder*="Type a message"]');
    await textarea.fill('hello codex');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect
      .poll(() => commandBodies.some((body) => body.type === 'sendTurn'))
      .toBe(true);

    const threadId = commandBodies.find((body) => body.type === 'sendTurn')
      .input.threadId;
    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId,
        createdAt: '2026-04-12T00:00:00.000Z',
        method: 'session.started',
        sessionId: threadId,
      },
    });
    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId,
        createdAt: '2026-04-12T00:00:01.000Z',
        method: 'content.text-delta',
        itemId: 'item-1',
        delta: 'Codex says hi',
      },
    });
    await emitMockOrchestrationEvent(page, 'orchestration:event', {
      event: {
        provider: 'codex',
        threadId,
        createdAt: '2026-04-12T00:00:02.000Z',
        method: 'turn.completed',
        turnId: 'turn-1',
      },
    });

    await expect(page.locator('body')).toContainText('Codex says hi');
  });
});
