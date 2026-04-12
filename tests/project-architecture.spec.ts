/**
 * E2E: Project Architecture
 *
 * Verifies the project-centric UI: sidebar, project CRUD, layout navigation,
 * provider settings, and coding layout rendering.
 *
 * Uses page.route to mock API responses for isolation from backend state.
 */
import { expect, test } from '@playwright/test';

const STATUS_READY = JSON.stringify({
  ready: true,
  bedrock: { credentialsFound: false, verified: null, region: 'us-east-1' },
  acp: { connected: false, connections: [] },
  clis: {},
  prerequisites: [],
});

const TEST_PROJECTS = [
  {
    id: 'p1',
    slug: 'alpha',
    name: 'Alpha',
    icon: '🚀',
    description: 'First project',
    hasWorkingDirectory: false,
    layoutCount: 1,
    hasKnowledge: false,
  },
];

const ALPHA_LAYOUTS = [
  {
    id: 'l1',
    slug: 'chat',
    projectSlug: 'alpha',
    type: 'chat',
    name: 'Chat',
    icon: '💬',
  },
];

const ALPHA_CONFIG = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  icon: '🚀',
  description: 'First project',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const CHAT_LAYOUT = {
  id: 'l1',
  slug: 'chat',
  projectSlug: 'alpha',
  type: 'chat',
  name: 'Chat',
  icon: '💬',
  config: {
    tabs: [{ id: 'main', label: 'Chat', component: 'chat' }],
    globalPrompts: [],
  },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const PROVIDERS = [
  {
    id: 'prov1',
    type: 'ollama',
    name: 'Local Ollama',
    config: { baseUrl: 'http://localhost:11434' },
    enabled: true,
    capabilities: ['llm'],
  },
];

function seedRoutes(page: import('@playwright/test').Page) {
  return Promise.all([
    page.route('**/api/system/status', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: STATUS_READY,
      }),
    ),
    page.route('**/api/projects', (r) => {
      if (r.request().method() === 'GET')
        return r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: TEST_PROJECTS }),
        });
      // POST — create project
      return r.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { ...ALPHA_CONFIG, slug: 'new-project', name: 'New Project' },
        }),
      });
    }),
    page.route('**/api/projects/alpha', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: ALPHA_CONFIG }),
      }),
    ),
    page.route('**/api/projects/alpha/layouts', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: ALPHA_LAYOUTS }),
      }),
    ),
    page.route('**/api/projects/alpha/layouts/chat', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: CHAT_LAYOUT }),
      }),
    ),
    page.route('**/api/providers', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: PROVIDERS }),
      }),
    ),
    page.route('**/api/agents', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      }),
    ),
    page.route('**/layouts', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      }),
    ),
    page.route('**/api/plugins', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      }),
    ),
    page.route('**/api/branding', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {} }),
      }),
    ),
    page.route('**/api/auth/status', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true }),
      }),
    ),
    page.route('**/api/config/app', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { defaultModel: 'claude-sonnet', region: 'us-east-1' },
        }),
      }),
    ),
    page.route('**/api/models/**', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      }),
    ),
    page.route('**/api/fs/browse**', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { path: '/tmp/new-project', entries: [] },
        }),
      }),
    ),
  ]);
}

test.describe('Project Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await seedRoutes(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('sidebar renders with projects and nav items', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Alpha/ })).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByRole('button', { name: /New Project/ }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Agents/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Providers/ })).toBeVisible();
  });

  test('header has no layout selector', async ({ page }) => {
    const banner = page.getByRole('banner');
    await expect(banner).toBeVisible();
    await expect(banner.getByText(/Stallion/)).toBeVisible();
    // No layout dropdown/combobox in header
    await expect(banner.getByRole('combobox')).not.toBeVisible();
  });

  test('expanding project shows layouts', async ({ page }) => {
    await page.getByRole('button', { name: /Alpha/ }).click();
    await expect(page.getByRole('button', { name: '💬Chat' })).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe('Project Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await seedRoutes(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('clicking project navigates to project view', async ({ page }) => {
    await page.getByRole('button', { name: /Alpha/ }).click();
    await expect(page).toHaveURL(/\/projects\/alpha/);
    await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible();
  });

  test('clicking layout navigates to layout view', async ({ page }) => {
    await page.getByRole('button', { name: /Alpha/ }).click();
    // The layout button in the sidebar may be behind the ChatDock overlay.
    // Use dispatchEvent to bypass pointer interception.
    const chatBtn = page.getByRole('button', { name: '💬Chat' });
    await chatBtn.dispatchEvent('click');
    await expect(page).toHaveURL(/\/projects\/alpha\/layouts\/chat/);
  });

  test('new project form renders', async ({ page }) => {
    await page
      .getByRole('button', { name: /New Project/ })
      .dispatchEvent('click');
    await expect(page).toHaveURL(/\/projects\/new/);
    await expect(page.getByPlaceholder('My Project')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByRole('button', { name: /Create/ })).toBeVisible();
  });

  test('creating a project with Add Coding Layout posts the canonical coding slug', async ({
    page,
  }) => {
    let createdLayoutBody: any = null;

    await page.route('**/api/projects/new-project', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            ...ALPHA_CONFIG,
            slug: 'new-project',
            name: 'New Project',
            workingDirectory: '/tmp/new-project',
          },
        }),
      }),
    );
    await page.route('**/api/projects/new-project/layouts', async (route) => {
      if (route.request().method() === 'POST') {
        createdLayoutBody = route.request().postDataJSON();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: createdLayoutBody }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    });

    await page
      .getByRole('button', { name: /New Project/ })
      .dispatchEvent('click');
    await page.evaluate(() => {
      document.querySelector('[data-testid="setup-launcher"]')?.remove();
    });
    await page.getByPlaceholder('My Project').fill('New Project');
    await page.getByPlaceholder('/path/to/project').fill('/tmp/new-project');
    await page.getByLabel('Add Coding Layout').check();
    await page.getByRole('button', { name: 'Create' }).click();

    await expect
      .poll(() => createdLayoutBody)
      .toMatchObject({
        type: 'coding',
        name: 'Coding',
        slug: 'coding',
        config: { workingDirectory: '/tmp/new-project' },
      });
  });
});

test.describe('Provider Settings', () => {
  test.beforeEach(async ({ page }) => {
    await seedRoutes(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('provider settings view renders', async ({ page }) => {
    await page.getByRole('button', { name: /Providers/ }).click();
    await expect(page).toHaveURL(/\/providers/);
    await expect(
      page.getByRole('heading', { name: 'Provider Connections' }),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole('button', { name: /Add Provider/ }),
    ).toBeVisible();
  });
});

test.describe('ChatDock', () => {
  test.beforeEach(async ({ page }) => {
    await seedRoutes(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('chat dock is visible at bottom', async ({ page }) => {
    await expect(page.getByText('Chat Dock')).toBeVisible();
    await expect(page.getByText(/\d+ sessions/)).toBeVisible();
  });
});
