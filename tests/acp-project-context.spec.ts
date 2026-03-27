/**
 * E2E: ACP badge + project context in chat sessions
 *
 * Verifies:
 * 1. ACP status badge renders when connections exist
 * 2. New chat sessions inherit the active project context
 * 3. Project context badge shows in session tab
 */
import { expect, test } from '@playwright/test';

const STATUS_ACP_CONNECTED = {
  ready: true,
  bedrock: { credentialsFound: true, verified: null, region: 'us-east-1' },
  acp: {
    connected: true,
    connections: [{ id: 'kiro', status: 'connected' }],
  },
  clis: { 'kiro-cli': true },
  prerequisites: [],
};

const ACP_CONNECTIONS = [
  {
    id: 'kiro',
    name: 'kiro-cli',
    command: 'kiro-cli',
    args: ['acp'],
    icon: '/kiro-icon.png',
    enabled: true,
    status: 'connected',
    modes: [{ id: 'chat', name: 'Chat' }],
    sessionId: 'sess-123',
    mcpServers: [],
    currentModel: 'claude-sonnet-4-20250514',
  },
];

const TEST_PROJECTS = [
  {
    id: 'p1',
    slug: 'my-project',
    name: 'My Project',
    icon: '🚀',
    description: 'Test project',
    hasWorkingDirectory: true,
    layoutCount: 1,
    hasKnowledge: false,
  },
];

const AGENTS = [
  {
    slug: 'default',
    name: 'Default Agent',
    description: 'System default',
    source: 'local',
  },
  {
    slug: 'kiro-chat',
    name: 'Chat',
    description: 'ACP Chat',
    source: 'acp',
    connectionName: 'kiro-cli',
  },
];

function seedRoutes(page: import('@playwright/test').Page) {
  return Promise.all([
    page.route('**/api/system/status', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(STATUS_ACP_CONNECTED),
      }),
    ),
    page.route('**/acp/connections', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: ACP_CONNECTIONS }),
      }),
    ),
    page.route('**/api/projects', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_PROJECTS),
      }),
    ),
    page.route('**/api/agents', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: AGENTS }),
      }),
    ),
    page.route('**/api/bedrock/models', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ models: [] }),
      }),
    ),
    page.route('**/api/config', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      }),
    ),
    page.route('**/events', (r) => r.abort()),
    page.route('**/api/system/capabilities', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          voice: { stt: [], tts: [] },
          context: { providers: [] },
        }),
      }),
    ),
    page.route('**/api/conversations**', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations: [] }),
      }),
    ),
    page.route('**/api/providers/connections', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      }),
    ),
  ]);
}

test.describe('ACP + Project Context', () => {
  test('ACP badge renders when connections are active', async ({ page }) => {
    await seedRoutes(page);
    await page.goto('/');
    // The ACP badge should be visible in the chat dock header
    const badge = page.locator('.acp-badge');
    await expect(badge).toBeVisible({ timeout: 5000 });
    await expect(badge).toContainText('ACP');
  });

  test('ACP badge shows connection count on click', async ({ page }) => {
    await seedRoutes(page);
    await page.goto('/');
    const badge = page.locator('.acp-badge');
    await expect(badge).toBeVisible({ timeout: 5000 });
    // Click to open the modal
    await badge.click();
    // Modal should show connection details
    await expect(page.getByText('Agent Client Protocol')).toBeVisible();
    await expect(page.getByText('kiro-cli')).toBeVisible();
    await expect(page.getByText('connected', { exact: true })).toBeVisible();
  });

  test('new chat inherits project context from localStorage', async ({
    page,
  }) => {
    await seedRoutes(page);
    // Seed localStorage with a last-selected project before navigating
    await page.addInitScript(() => {
      localStorage.setItem('lastProject', 'my-project');
    });
    await page.goto('/?dock=open');

    // Click "+ New" — opens modal since there are 2 agents (default + ACP)
    const newChatBtn = page.getByRole('button', { name: '+ New' });
    await expect(newChatBtn).toBeVisible({ timeout: 5000 });
    await newChatBtn.evaluate((el) =>
      el.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );

    // Modal should show — click the Default Agent
    const modal = page.getByText('New Chat');
    await expect(modal).toBeVisible({ timeout: 3000 });
    const agentCard = page.getByText('Default Agent').first();
    await expect(agentCard).toBeVisible({ timeout: 3000 });
    await agentCard.evaluate((el) =>
      el.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );

    // The session tab or body should show the project context (name or slug)
    await page.waitForTimeout(500);
    await expect(
      page.locator('.chat-dock__session-project').first(),
    ).toContainText(/My Project|my-project/);
  });

  test('ACP badge hidden when no connections', async ({ page }) => {
    // Override with no ACP connections
    await page.route('**/api/system/status', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...STATUS_ACP_CONNECTED,
          acp: { connected: false, connections: [] },
        }),
      }),
    );
    await page.route('**/acp/connections', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      }),
    );
    await page.route('**/api/projects', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_PROJECTS),
      }),
    );
    await page.route('**/api/agents', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: AGENTS.filter((a) => a.source !== 'acp'),
        }),
      }),
    );
    await page.route('**/api/bedrock/models', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ models: [] }),
      }),
    );
    await page.route('**/api/config', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      }),
    );
    await page.route('**/events', (r) => r.abort());
    await page.route('**/api/system/capabilities', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          voice: { stt: [], tts: [] },
          context: { providers: [] },
        }),
      }),
    );
    await page.route('**/api/conversations**', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations: [] }),
      }),
    );
    await page.route('**/api/providers/connections', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      }),
    );

    await page.goto('/');
    // ACP badge should NOT be visible
    const badge = page.locator('.acp-badge');
    await expect(badge).not.toBeVisible({ timeout: 3000 });
  });
});
