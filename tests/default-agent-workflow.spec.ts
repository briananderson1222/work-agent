import { expect, test } from '@playwright/test';

const DEFAULT_PROJECT = {
  id: 'p-default',
  slug: 'default',
  name: 'Default',
  description: 'Default project',
  hasWorkingDirectory: false,
  layoutCount: 0,
  hasKnowledge: false,
};

const DEFAULT_AGENT = {
  slug: 'default',
  name: 'Stallion',
  description: 'Default agent with full access to manage Stallion',
  source: 'local',
  model: 'llama3.2',
};

function json(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

async function seedDefaultAgentRoutes(
  page: import('@playwright/test').Page,
  options?: {
    chatFailure?: boolean;
    initialConversations?: Array<{
      id: string;
      resourceId: string;
      userId: string;
      title: string;
      createdAt: string;
      updatedAt: string;
    }>;
    initialMessagesByConversation?: Record<string, any[]>;
  },
) {
  const state = {
    conversations: (options?.initialConversations ?? []) as Array<{
      id: string;
      resourceId: string;
      userId: string;
      title: string;
      createdAt: string;
      updatedAt: string;
    }>,
    messagesByConversation: (options?.initialMessagesByConversation ??
      {}) as Record<string, any[]>,
  };

  await Promise.all([
    page.route('**/api/system/status', (route) =>
      route.fulfill(
        json({
          ready: true,
          acp: { connected: false, connections: [] },
          providers: {
            configured: [
              {
                id: 'ollama-local',
                type: 'ollama',
                enabled: true,
                capabilities: ['llm'],
              },
            ],
            detected: { ollama: true, bedrock: false },
          },
          capabilities: {
            chat: { ready: true, source: 'ollama' },
            runtime: { ready: false, source: null },
            knowledge: { ready: false, source: null },
            acp: { ready: false, source: null },
          },
          recommendation: null,
          prerequisites: [],
          clis: { codex: false, claude: false, 'kiro-cli': false },
          bedrock: { credentialsFound: false, verified: null, region: null },
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
      route.fulfill(json({ success: true, data: [DEFAULT_PROJECT] })),
    ),
    page.route('**/api/projects/default', (route) =>
      route.fulfill(
        json({
          success: true,
          data: {
            ...DEFAULT_PROJECT,
            agents: ['default'],
            createdAt: '2026-04-12T00:00:00Z',
            updatedAt: '2026-04-12T00:00:00Z',
          },
        }),
      ),
    ),
    page.route('**/api/agents', (route) =>
      route.fulfill(json({ success: true, data: [DEFAULT_AGENT] })),
    ),
    page.route('**/api/agents/default', (route) =>
      route.fulfill(
        json({
          success: true,
          data: {
            ...DEFAULT_AGENT,
            toolsConfig: { mcpServers: ['stallion-control'], autoApprove: [] },
          },
        }),
      ),
    ),
    page.route('**/agents/default/tools', (route) =>
      route.fulfill(
        json({
          success: true,
          data: [
            {
              id: 'stallion-control_list_agents',
              server: 'stallion-control',
              toolName: 'list_agents',
              originalName: 'stallion-control_list_agents',
              description: 'List all configured agents',
              parameters: { properties: {} },
            },
            {
              id: 'stallion-control_create_prompt',
              server: 'stallion-control',
              toolName: 'create_prompt',
              originalName: 'stallion-control_create_prompt',
              description: 'Create a prompt',
              parameters: { properties: { name: { type: 'string' } } },
            },
          ],
        }),
      ),
    ),
    page.route('**/api/connections/runtimes', (route) =>
      route.fulfill(json({ success: true, data: [] })),
    ),
    page.route('**/api/connections/models', (route) =>
      route.fulfill(
        json({
          success: true,
          data: [
            {
              id: 'ollama-local',
              kind: 'model',
              type: 'ollama',
              name: 'Ollama',
              enabled: true,
              capabilities: ['llm'],
              config: {},
              status: 'ready',
              prerequisites: [],
            },
          ],
        }),
      ),
    ),
    page.route('**/config/app', (route) =>
      route.fulfill(
        json({
          success: true,
          data: {
            defaultModel: 'llama3.2',
            defaultLLMProvider: 'ollama-local',
          },
        }),
      ),
    ),
    page.route('**/api/bedrock/models', (route) =>
      route.fulfill(json({ models: [] })),
    ),
    page.route('**/agents/default/conversations', (route) =>
      route.fulfill(json({ success: true, data: state.conversations })),
    ),
    page.route('**/agents/default/conversations/*/messages', (route) => {
      const match = route
        .request()
        .url()
        .match(/\/agents\/default\/conversations\/([^/]+)\/messages/);
      const conversationId = match?.[1]
        ? decodeURIComponent(match[1])
        : 'unknown';
      route.fulfill(
        json({
          success: true,
          data: state.messagesByConversation[conversationId] || [],
        }),
      );
    }),
    page.route('**/agents/default/conversations/*/stats', (route) =>
      route.fulfill(
        json({
          success: true,
          data: {
            contextTokens: 120,
            contextWindowPercentage: 1.5,
            systemPromptTokens: 20,
            mcpServerTokens: 10,
            userMessageTokens: 30,
            assistantMessageTokens: 60,
            inputTokens: 30,
            outputTokens: 60,
            totalTokens: 90,
            turns: 1,
            toolCalls: 0,
            estimatedCost: 0,
            modelStats: { 'llama3.2': { turns: 1, toolCalls: 0 } },
          },
        }),
      ),
    ),
    page.route('**/agents/default/conversations/*', async (route) => {
      const match = route
        .request()
        .url()
        .match(/\/agents\/default\/conversations\/([^/?]+)/);
      const conversationId = match?.[1]
        ? decodeURIComponent(match[1])
        : 'unknown';

      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON() as { title?: string };
        state.conversations = state.conversations.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                title: body.title || conversation.title,
                updatedAt: '2026-04-12T00:00:20Z',
              }
            : conversation,
        );
        await route.fulfill(
          json({
            success: true,
            data: state.conversations.find(
              (conversation) => conversation.id === conversationId,
            ),
          }),
        );
        return;
      }

      if (route.request().method() === 'DELETE') {
        state.conversations = state.conversations.filter(
          (conversation) => conversation.id !== conversationId,
        );
        delete state.messagesByConversation[conversationId];
        await route.fulfill(json({ success: true }));
        return;
      }

      await route.fallback();
    }),
    page.route('**/api/agents/default/chat', async (route) => {
      if (options?.chatFailure) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Synthetic provider failure',
          }),
        });
        return;
      }

      const conversationId = 'conv-default-1';
      state.conversations = [
        {
          id: conversationId,
          resourceId: 'default',
          userId: 'brian',
          title: 'Stallion Chat',
          createdAt: '2026-04-12T00:00:00Z',
          updatedAt: '2026-04-12T00:00:10Z',
        },
      ];
      state.messagesByConversation[conversationId] = [
        {
          role: 'user',
          parts: [{ type: 'text', text: 'say hi in 3 words' }],
          metadata: { timestamp: '2026-04-12T00:00:01Z' },
        },
        {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hi from Stallion!' }],
          metadata: { timestamp: '2026-04-12T00:00:02Z' },
        },
      ];

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'data: {"type":"conversation-started","conversationId":"conv-default-1","title":"Stallion Chat"}',
          '',
          'data: {"type":"text-delta","textDelta":"Hi from Stallion!"}',
          '',
          'data: {"type":"finish","finishReason":"stop","usage":{"inputTokens":1,"outputTokens":3}}',
          '',
          'data: {"type":"result","text":"Hi from Stallion!"}',
          '',
        ].join('\n'),
      });
    }),
    page.route('**/events', (route) => route.abort()),
  ]);
}

async function openDefaultAgentSession(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('lastProject', 'default');
    localStorage.removeItem('recentAgents');
  });
  await page.goto('/?dock=open');
  await page.waitForTimeout(1200);
  await page
    .locator('.chat-dock__tab-actions .chat-dock__new')
    .nth(1)
    .dispatchEvent('click');
  await page.waitForTimeout(400);
  await page
    .locator('.new-chat-modal__agent', { hasText: 'Stallion' })
    .click({ force: true });
  await page.waitForTimeout(700);
}

test.describe('Default agent workflow', () => {
  test('supports key slash commands and persists sent chats to history', async ({
    page,
  }) => {
    await seedDefaultAgentRoutes(page);
    await openDefaultAgentSession(page);

    const textarea = page.locator('textarea[placeholder*="Type a message"]');
    const sendButton = page.getByRole('button', { name: 'Send' });

    for (const [command, matcher] of [
      ['/mcp', /MCP Servers \(1\):/],
      ['/tools', /Available Tools \(2\):/],
      ['/prompts', /No prompts or custom commands defined/],
      ['/stats', /No conversation ID available/],
    ] as const) {
      await textarea.fill(command);
      await sendButton.click();
      await page.waitForTimeout(900);
      await expect(page.locator('body')).toContainText(matcher);
    }

    await textarea.fill('say hi in 3 words');
    await sendButton.click();
    await expect(page.locator('body')).toContainText('Hi from Stallion!');

    await textarea.fill('/stats');
    await sendButton.click();
    await page.waitForTimeout(900);
    await expect(page.locator('body')).toContainText('Conversation Statistics');

    await textarea.fill('/clear');
    await sendButton.click();
    await page.waitForTimeout(700);
    await expect(page.locator('body')).toContainText('Conversation cleared');

    await textarea.fill('/new');
    await sendButton.click();
    await page.waitForTimeout(700);
    await expect(page.locator('body')).toContainText('Conversation cleared');

    await textarea.fill('/resume');
    await sendButton.click();
    await expect(page.getByText('New Chat')).toBeVisible();
    await page.keyboard.press('Escape');

    await textarea.fill('/chat');
    await sendButton.click();
    await expect(page.getByText('New Chat')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.locator('button.chat-dock__history-toggle').click();
    await expect(page.locator('.conversation-history')).toContainText(
      'History (1)',
    );
    await expect(page.locator('.conversation-history')).toContainText(
      'Stallion Chat',
    );
  });

  test('surfaces provider errors ephemerally instead of silently no-oping', async ({
    page,
  }) => {
    await seedDefaultAgentRoutes(page, { chatFailure: true });
    await openDefaultAgentSession(page);

    const textarea = page.locator('textarea[placeholder*="Type a message"]');
    await textarea.fill('trigger failure');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.locator('body')).toContainText('Error: HTTP 500');
  });

  test('supports history rename, delete, and clear-all flows', async ({
    page,
  }) => {
    await seedDefaultAgentRoutes(page, {
      initialConversations: [
        {
          id: 'conv-a',
          resourceId: 'default',
          userId: 'brian',
          title: 'Alpha Chat',
          createdAt: '2026-04-12T00:00:00Z',
          updatedAt: '2026-04-12T00:00:10Z',
        },
        {
          id: 'conv-b',
          resourceId: 'default',
          userId: 'brian',
          title: 'Beta Chat',
          createdAt: '2026-04-12T00:00:00Z',
          updatedAt: '2026-04-12T00:00:05Z',
        },
      ],
    });
    await page.addInitScript(() => {
      localStorage.setItem('lastProject', 'default');
      localStorage.removeItem('recentAgents');
    });
    await page.goto('/?dock=open');
    await page.waitForTimeout(1200);

    await page.locator('button.chat-dock__history-toggle').click();
    const history = page.locator('.conversation-history');
    await expect(history).toContainText('Alpha Chat');
    await expect(history).toContainText('Beta Chat');

    const alphaItem = page
      .locator('.session-item')
      .filter({ hasText: 'Alpha Chat' });
    await alphaItem.getByTitle('Rename').click();
    await page.locator('.session-item__rename-input').fill('Renamed Chat');
    await page.locator('.session-item__rename-input').press('Enter');
    await expect(history).toContainText('Renamed Chat');

    const betaItem = page
      .locator('.session-item')
      .filter({ hasText: 'Beta Chat' });
    await betaItem.getByTitle('Delete').click();
    await page.getByRole('button', { name: 'Delete' }).last().click();
    await expect(history).not.toContainText('Beta Chat');

    await page.getByRole('button', { name: 'Clear All' }).click();
    await page.getByRole('button', { name: 'Clear All' }).last().click();
    await expect(history).toContainText('No conversations yet');
  });
});
