/**
 * E2E: Dock Mode Preference
 *
 * Verifies that layout-declared dock mode preferences apply silently
 * (no URL param) and that explicit user overrides (⌘⇧D, settings panel)
 * write to both URL and sessionStorage.
 */
import { test, expect } from '@playwright/test';

const STATUS_READY = JSON.stringify({
  ready: true,
  bedrock: { credentialsFound: false, verified: null, region: 'us-east-1' },
  acp: { connected: false, connections: [] },
  clis: {},
  prerequisites: [],
});

const TEST_PROJECTS = [
  {
    id: 'p1', slug: 'dev', name: 'Dev', icon: '💻',
    description: 'Dev project', hasWorkingDirectory: true, layoutCount: 1, hasKnowledge: false,
  },
];

const DEV_LAYOUTS = [
  { id: 'l1', slug: 'code', projectSlug: 'dev', type: 'coding', name: 'Code', icon: '🖥️' },
];

const DEV_CONFIG = {
  id: 'p1', slug: 'dev', name: 'Dev', icon: '💻',
  description: 'Dev project',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

const CODING_LAYOUT = {
  id: 'l1', slug: 'code', projectSlug: 'dev', type: 'coding', name: 'Code', icon: '🖥️',
  config: { workingDirectory: '/tmp/test', tabs: [], globalPrompts: [] },
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

function seedRoutes(page: import('@playwright/test').Page) {
  return Promise.all([
    page.route('**/api/system/status', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: STATUS_READY })),
    page.route('**/api/projects', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: TEST_PROJECTS }) })),
    page.route('**/api/projects/dev', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: DEV_CONFIG }) })),
    page.route('**/api/projects/dev/layouts', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: DEV_LAYOUTS }) })),
    page.route('**/api/projects/dev/layouts/code', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: CODING_LAYOUT }) })),
    page.route('**/api/agents', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })),
    page.route('**/layouts', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })),
    page.route('**/api/plugins', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })),
    page.route('**/api/branding', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })),
    page.route('**/api/auth/status', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true }) })),
    page.route('**/api/config/app', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { defaultModel: 'claude-sonnet', region: 'us-east-1' } }) })),
    page.route('**/api/models/**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })),
    page.route('**/api/projects/dev/git/**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: null }) })),
    page.route('**/api/projects/dev/files**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })),
    page.route('**/api/terminal/**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })),
  ]);
}

test.describe('Dock Mode Preference', () => {
  test.beforeEach(async ({ page }) => {
    await seedRoutes(page);
  });

  test('coding layout applies right dock mode without URL param', async ({ page }) => {
    await page.goto('/projects/dev/layouts/code');
    await page.waitForTimeout(3000);

    // Dock should be in right mode (coding layout preference)
    const chatDock = page.locator('.chat-dock');
    await expect(chatDock).toHaveClass(/chat-dock--right/);

    // URL should NOT contain dockMode param
    const url = new URL(page.url());
    expect(url.searchParams.has('dockMode')).toBe(false);
  });

  test('⌘⇧D writes dockMode to URL', async ({ page }) => {
    await page.goto('/projects/dev/layouts/code');
    await page.waitForTimeout(3000);

    // Cycle dock mode with keyboard shortcut
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);

    // URL should now contain dockMode param (cycled from 'right' → 'bottom-inline')
    const url = new URL(page.url());
    expect(url.searchParams.has('dockMode')).toBe(true);
  });

  test('⌘⇧D persists override in sessionStorage', async ({ page }) => {
    await page.goto('/projects/dev/layouts/code');
    await page.waitForTimeout(3000);

    // Cycle dock mode
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);

    // Check sessionStorage has the override
    const override = await page.evaluate(() =>
      sessionStorage.getItem('stallion-dock-mode-override:coding')
    );
    expect(override).toBeTruthy();
  });

  test('sessionStorage override applies without URL param on revisit', async ({ page }) => {
    // Pre-seed sessionStorage with a bottom-inline override
    await page.addInitScript(() => {
      sessionStorage.setItem('stallion-dock-mode-override:coding', 'bottom-inline');
    });

    await page.goto('/projects/dev/layouts/code');
    await page.waitForTimeout(3000);

    // Dock should be in bottom-inline mode (from sessionStorage override)
    const chatDock = page.locator('.chat-dock');
    await expect(chatDock).toHaveClass(/chat-dock--bottom-inline/);

    // URL should still NOT contain dockMode param (override applied quietly)
    const url = new URL(page.url());
    expect(url.searchParams.has('dockMode')).toBe(false);
  });

  test('explicit URL dockMode param is respected over layout preference', async ({ page }) => {
    await page.goto('/projects/dev/layouts/code?dockMode=bottom-inline');
    await page.waitForTimeout(3000);

    // Dock should be in bottom-inline mode (from URL), not right (layout preference)
    const chatDock = page.locator('.chat-dock');
    await expect(chatDock).toHaveClass(/chat-dock--bottom-inline/);

    // URL param should persist
    const url = new URL(page.url());
    expect(url.searchParams.get('dockMode')).toBe('bottom-inline');
  });

  test('navigating away from coding layout restores previous dock mode', async ({ page }) => {
    // Start on home (default bottom dock)
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Navigate to coding layout
    await page.goto('/projects/dev/layouts/code');
    await page.waitForTimeout(3000);

    // Dock should be right
    await expect(page.locator('.chat-dock')).toHaveClass(/chat-dock--right/);

    // Navigate away
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Dock should be back to bottom (no --right or --bottom-inline class)
    const chatDock = page.locator('.chat-dock');
    const classes = await chatDock.getAttribute('class');
    expect(classes).not.toContain('chat-dock--right');
  });
});

test.describe('Dock Mode — Mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await seedRoutes(page);
  });

  test('keyboard shortcut text is hidden on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const subtitles = page.locator('.chat-dock .chat-dock__subtitle');
    const count = await subtitles.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const display = await subtitles.nth(i).evaluate(el => getComputedStyle(el).display);
      expect(display).toBe('none');
    }
  });

  test('New/Open buttons show icons instead of text on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Open the dock to see tab bar
    await page.locator('.chat-dock__header').click();
    await page.waitForTimeout(500);

    // Button labels should be hidden
    const labels = page.locator('.chat-dock__new-label');
    const labelCount = await labels.count();
    for (let i = 0; i < labelCount; i++) {
      const display = await labels.nth(i).evaluate(el => getComputedStyle(el).display);
      expect(display).toBe('none');
    }

    // Icons should be visible
    const icons = page.locator('.chat-dock__new-icon');
    const iconCount = await icons.count();
    expect(iconCount).toBeGreaterThan(0);
    for (let i = 0; i < iconCount; i++) {
      const display = await icons.nth(i).evaluate(el => getComputedStyle(el).display);
      expect(display).not.toBe('none');
    }
  });

  test('maximize arrows point up/down on mobile even in right dock mode', async ({ page }) => {
    // Navigate to coding layout which prefers right dock
    await page.goto('/projects/dev/layouts/code');
    await page.waitForTimeout(3000);

    // On mobile, arrows should be vertical (⬆/⬇) not horizontal (⬅/➡)
    const maximizeBtn = page.locator('.chat-dock__maximize-btn');
    const text = await maximizeBtn.textContent();
    expect(text).toContain('⬆');
    expect(text).not.toContain('⬅');
  });
});
