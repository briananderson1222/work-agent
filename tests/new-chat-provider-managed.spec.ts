import { expect, test } from '@playwright/test';

const PROJECTS = [
  {
    id: 'p1',
    slug: 'my-project',
    name: 'My Project',
    icon: '🚀',
    description: 'Project with provider-backed managed chat',
    hasWorkingDirectory: true,
    workingDirectory: '/work/my-project',
    layoutCount: 0,
    hasKnowledge: false,
  },
];

const AGENTS = [
  {
    slug: 'default',
    name: 'Stallion',
    description: 'Default agent with full access to manage Stallion',
    source: 'local',
    model: 'us.anthropic.claude-sonnet-4-6',
    toolsConfig: { mcpServers: ['stallion-control'], autoApprove: [] },
  },
];

function seedRoutes(
  page: import('@playwright/test').Page,
  options?: {
    projectHasProviderDefaults?: boolean;
    agentRequiresMcp?: boolean;
    runtimeConnections?: unknown[];
  },
) {
  const agents =
    options?.agentRequiresMcp === false
      ? [
          {
            ...AGENTS[0],
            toolsConfig: { mcpServers: [], autoApprove: [] },
          },
        ]
      : AGENTS;
  const projectConfig = {
    ...PROJECTS[0],
    ...(options?.projectHasProviderDefaults
      ? {
          defaultProviderId: 'ollama-local',
          defaultModel: 'llama3.2',
        }
      : {}),
    agents: ['default'],
    createdAt: '2026-04-12T00:00:00Z',
    updatedAt: '2026-04-12T00:00:00Z',
  };
  return Promise.all([
    page.route('**/api/projects', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: PROJECTS }),
      }),
    ),
    page.route('**/api/projects/my-project', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: projectConfig,
        }),
      }),
    ),
    page.route('**/api/agents', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: agents }),
      }),
    ),
    page.route('**/api/connections/runtimes', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: options?.runtimeConnections ?? [],
        }),
      }),
    ),
    page.route('**/api/connections/models', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'ollama-local',
              kind: 'model',
              type: 'ollama',
              name: 'Local Ollama',
              enabled: true,
              capabilities: ['llm'],
              config: { baseUrl: 'http://localhost:11434' },
              status: 'ready',
              prerequisites: [],
            },
          ],
        }),
      }),
    ),
    page.route('**/api/system/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
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
        }),
      }),
    ),
    page.route('**/api/system/capabilities', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          voice: { stt: [], tts: [] },
          context: { providers: [] },
        }),
      }),
    ),
    page.route('**/config/app', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            defaultModel: 'llama3.2',
            defaultLLMProvider: 'ollama-local',
          },
        }),
      }),
    ),
    page.route('**/api/bedrock/models', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ models: [] }),
      }),
    ),
    page.route('**/api/conversations**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations: [] }),
      }),
    ),
    page.route('**/events', (route) => route.abort()),
  ]);
}

test('new chat does not show Stallion for a global provider-managed fallback path when MCP is required', async ({
  page,
}) => {
  await seedRoutes(page);
  await page.addInitScript(() => {
    localStorage.removeItem('recentAgents');
  });

  await page.goto('/?dock=open');

  const newChatBtn = page.getByTitle(/New Chat/);
  await expect(newChatBtn).toBeVisible({ timeout: 5000 });
  await newChatBtn.dispatchEvent('click');

  await expect(page.getByText('New Chat')).toBeVisible({ timeout: 3000 });
  await expect(
    page.locator('.new-chat-modal__group-label', { hasText: 'Global' }),
  ).toHaveCount(0);
  await expect(page.getByText('Runtime Chat')).not.toBeVisible();

  await expect(
    page.locator('.new-chat-modal__agent', { hasText: 'Stallion' }),
  ).toHaveCount(0);
});

test('selected project context does not show Stallion when provider-managed fallback cannot satisfy MCP', async ({
  page,
}) => {
  await seedRoutes(page, { projectHasProviderDefaults: false });
  await page.addInitScript(() => {
    localStorage.setItem('lastProject', 'my-project');
    localStorage.removeItem('recentAgents');
  });

  await page.goto('/?dock=open');

  const newChatBtn = page.getByTitle(/New Chat/);
  await expect(newChatBtn).toBeVisible({ timeout: 5000 });
  await newChatBtn.dispatchEvent('click');

  await expect(page.getByText('New Chat')).toBeVisible({ timeout: 3000 });
  await expect(page.getByRole('button', { name: /My Project/ })).toBeVisible();

  await expect(
    page.locator('.new-chat-modal__agent', { hasText: 'Stallion' }),
  ).toHaveCount(0);
});

test('new chat shows degraded runtime compatibility messaging from runtime catalog status', async ({
  page,
}) => {
  await seedRoutes(page, {
    runtimeConnections: [
      {
        id: 'codex-runtime',
        kind: 'runtime',
        type: 'codex-runtime',
        name: 'Codex Runtime',
        enabled: true,
        capabilities: ['agent-runtime'],
        config: { defaultModel: 'gpt-5-codex' },
        status: 'degraded',
        runtimeCatalog: {
          source: 'fallback',
          reason: 'Live catalog unavailable.',
          models: [],
          fallbackModels: [
            {
              id: 'gpt-5-codex',
              name: 'GPT-5 Codex',
              originalId: 'gpt-5-codex',
            },
          ],
        },
        prerequisites: [],
      },
    ],
  });
  await page.addInitScript(() => {
    localStorage.removeItem('recentAgents');
  });

  await page.goto('/?dock=open');

  const newChatBtn = page.getByTitle(/New Chat/);
  await expect(newChatBtn).toBeVisible({ timeout: 5000 });
  await newChatBtn.dispatchEvent('click');

  await expect(page.getByText('New Chat')).toBeVisible({ timeout: 3000 });
  await expect(
    page.getByText(
      /Runtime status: Codex Runtime: Degraded · Catalog Fallback — Live catalog unavailable\./,
    ),
  ).toBeVisible();
});

test('new chat still shows Stallion when provider-managed fallback matches the agent capability set', async ({
  page,
}) => {
  await seedRoutes(page, { agentRequiresMcp: false });
  await page.addInitScript(() => {
    localStorage.removeItem('recentAgents');
  });

  await page.goto('/?dock=open');

  const newChatBtn = page.getByTitle(/New Chat/);
  await expect(newChatBtn).toBeVisible({ timeout: 5000 });
  await newChatBtn.dispatchEvent('click');

  await expect(page.getByText('New Chat')).toBeVisible({ timeout: 3000 });
  await expect(
    page.locator('.new-chat-modal__group-label', { hasText: 'Global' }),
  ).toBeVisible();
  await expect(
    page.locator('.new-chat-modal__agent', { hasText: 'Stallion' }),
  ).toBeVisible();
});
