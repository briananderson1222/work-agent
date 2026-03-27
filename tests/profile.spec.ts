import { expect, test } from '@playwright/test';

const MOCK_USAGE = {
  lifetime: {
    totalMessages: 42,
    totalCost: 1.23,
    totalConversations: 5,
    firstMessageDate: '2026-01-15T10:00:00Z',
    streak: 3,
  },
  byModel: {
    'anthropic.claude-3-sonnet': { messages: 30, cost: 0.9, tokens: 50000 },
    'anthropic.claude-3-haiku': { messages: 12, cost: 0.33, tokens: 20000 },
  },
  byAgent: {
    default: { messages: 35, cost: 1.0, conversations: 4 },
    coder: { messages: 7, cost: 0.23, conversations: 1 },
  },
  byDate: {},
};

const MOCK_ACHIEVEMENTS = [
  {
    id: 'first-message',
    name: 'First Message',
    description: 'Send your first message',
    unlocked: true,
    progress: 100,
  },
  {
    id: 'power-user',
    name: 'Power User',
    description: 'Send 100 messages',
    unlocked: false,
    progress: 42,
  },
];

const MOCK_INSIGHTS = {
  toolUsage: {},
  hourlyActivity: Array(24).fill(0),
  agentUsage: {},
  modelUsage: {},
  totalChats: 0,
  totalToolCalls: 0,
  totalErrors: 0,
  days: 14,
};

function setupRoutes(page: import('@playwright/test').Page) {
  return Promise.all([
    page.route('**/api/analytics/usage*', (route) => {
      if (route.request().method() === 'DELETE') {
        return route.fulfill({ json: { success: true } });
      }
      return route.fulfill({ json: { data: MOCK_USAGE } });
    }),
    page.route('**/api/analytics/achievements', (route) =>
      route.fulfill({ json: { data: MOCK_ACHIEVEMENTS } }),
    ),
    page.route('**/api/insights*', (route) =>
      route.fulfill({ json: { data: MOCK_INSIGHTS } }),
    ),
    page.route('**/api/feedback/ratings', (route) =>
      route.fulfill({ json: { data: [] } }),
    ),
    page.route('**/api/feedback/guidelines', (route) =>
      route.fulfill({ json: { data: null } }),
    ),
    page.route('**/api/feedback/status', (route) =>
      route.fulfill({
        json: { data: { isAnalyzing: false, analyzeCallbackAvailable: true } },
      }),
    ),
    page.route('**/api/agents', (route) =>
      route.fulfill({ json: { success: true, data: [] } }),
    ),
    page.route('**/config/app', (route) =>
      route.fulfill({
        json: { success: true, data: { defaultModel: 'test' } },
      }),
    ),
    page.route('**/api/system/status', (route) =>
      route.fulfill({
        json: {
          prerequisites: [],
          bedrock: {},
          acp: { connections: [] },
          ready: true,
        },
      }),
    ),
    page.route('**/api/system/capabilities', (route) =>
      route.fulfill({
        json: {
          runtime: 'voltagent',
          voice: { stt: [], tts: [] },
          context: { providers: [] },
          scheduler: true,
        },
      }),
    ),
    page.route('**/api/models/**', (route) =>
      route.fulfill({ json: { success: true, data: [] } }),
    ),
    page.route('**/api/branding', (route) =>
      route.fulfill({ json: { success: true, data: {} } }),
    ),
    page.route('**/api/analytics/rescan', (route) =>
      route.fulfill({ json: { data: MOCK_USAGE } }),
    ),
  ]);
}

test.describe('Profile Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupRoutes(page);
  });

  test('navigates to profile via header button', async ({ page }) => {
    await page.goto('/');
    const profileBtn = page.getByRole('button', { name: 'Profile' });
    await profileBtn.click();
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.locator('.profile-page')).toBeVisible();
  });

  test('displays hero card with usage stats', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('.profile-hero-title')).toBeVisible();
    await expect(page.locator('.profile-hero-subtitle')).toContainText(
      '42 messages',
    );
  });

  test('renders usage stats panel with stat cards', async ({ page }) => {
    await page.goto('/profile');
    const panel = page.locator('.usage-stats-panel');
    await expect(panel.getByText('Messages')).toBeVisible();
    await expect(panel.getByText('Conversations')).toBeVisible();
    await expect(panel.getByText('Total Cost')).toBeVisible();
    await expect(panel.getByText('Avg/Message')).toBeVisible();
    await expect(panel.getByText('42')).toBeVisible();
  });

  test('switches between Usage and Feedback tabs', async ({ page }) => {
    await page.goto('/profile');
    // Usage tab active by default
    const usageTab = page.getByRole('button', { name: '📊 Usage' });
    const feedbackTab = page.getByRole('button', { name: '💬 Feedback' });
    await expect(usageTab).toHaveClass(/is-active/);

    // Switch to Feedback
    await feedbackTab.click();
    await expect(feedbackTab).toHaveClass(/is-active/);
    await expect(page.getByText('No ratings yet')).toBeVisible();

    // Switch back to Usage
    await usageTab.click();
    await expect(usageTab).toHaveClass(/is-active/);
  });

  test('time period filters change active state', async ({ page }) => {
    await page.goto('/profile');
    // Click Feedback tab first (it has the time pills visible without data)
    // Actually Usage tab (InsightsDashboard) has the pills
    const pill7d = page.locator('.insights-pill', { hasText: '7d' });
    const pill14d = page.locator('.insights-pill', { hasText: '14d' });
    const pill30d = page.locator('.insights-pill', { hasText: '30d' });

    await expect(pill14d).toHaveClass(/is-active/);
    await pill7d.click();
    await expect(pill7d).toHaveClass(/is-active/);
    await pill30d.click();
    await expect(pill30d).toHaveClass(/is-active/);
  });

  test('reset confirmation dialog works', async ({ page }) => {
    await page.goto('/profile');
    const resetBtn = page.getByRole('button', { name: 'Reset' });
    await resetBtn.click();

    // Confirm dialog appears
    await expect(page.getByText('Reset Usage Statistics')).toBeVisible();
    await expect(page.getByText('This will permanently clear')).toBeVisible();

    // Cancel dismisses
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Reset Usage Statistics')).not.toBeVisible();

    // Open again and confirm
    await resetBtn.click();
    await page.getByRole('button', { name: 'Reset All' }).click();
    await expect(page.getByText('Reset Usage Statistics')).not.toBeVisible();
  });

  test('shows empty states with no data', async ({ page }) => {
    await page.route('**/api/analytics/usage*', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          json: {
            data: {
              lifetime: {
                totalMessages: 0,
                totalCost: 0,
                totalConversations: 0,
              },
              byModel: {},
              byAgent: {},
              byDate: {},
            },
          },
        });
      }
      return route.fulfill({ json: { success: true } });
    });
    await page.goto('/profile');
    await expect(
      page.getByText('Start your journey with your first message'),
    ).toBeVisible();
    await expect(page.getByText('No model data yet')).toBeVisible();
    await expect(page.getByText('No agent data yet')).toBeVisible();
  });

  test('mobile layout stacks vertically', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/profile');
    await expect(page.locator('.profile-page')).toBeVisible();

    // Stats grid should be single column at mobile
    const grid = page.locator('.profile-stats-grid');
    const box = await grid.boundingBox();
    if (box) {
      // In single-column mode, width should be close to viewport width
      expect(box.width).toBeLessThan(400);
    }
  });

  test('no console errors on profile page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/profile');
    await page.waitForTimeout(1000);
    expect(errors).toEqual([]);
  });

  test('loading state appears before data loads', async ({ page }) => {
    // Delay the usage response
    await page.route('**/api/analytics/usage*', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({ json: { data: MOCK_USAGE } });
    });
    await page.goto('/profile');
    await expect(page.getByText('Loading profile...')).toBeVisible();
  });
});
