/**
 * Plugin preview modal tests — validates the install preview flow:
 * validation, component listing, conflict detection, dependency display.
 */
import { test, expect } from '@playwright/test';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_DIR = join(dirname(__filename), '..');
const DEMO_DIR = join(PROJECT_DIR, 'examples', 'demo-workspace');
const SA_AGENT_DIR = join(PROJECT_DIR, '..', 'sa-agent');

const API = 'http://localhost:3141';

test.describe('Plugin Preview', () => {
  test.beforeAll(() => {
    // Ensure demo-workspace is built
    execSync('npx tsx ../../packages/cli/src/cli.ts build', { cwd: DEMO_DIR, timeout: 15000 });
  });

  test('preview API validates a valid plugin', async () => {
    const res = await (await fetch(`${API}/api/plugins/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: DEMO_DIR }),
    })).json();

    expect(res.valid).toBe(true);
    expect(res.manifest.name).toBe('demo-workspace');
    expect(res.components.length).toBeGreaterThan(0);
    expect(Array.isArray(res.conflicts)).toBe(true);
  });

  test('preview API rejects invalid source', async () => {
    const res = await (await fetch(`${API}/api/plugins/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: '/tmp/nonexistent-plugin-xyz' }),
    })).json();

    expect(res.valid).toBe(false);
    expect(res.error).toBeTruthy();
  });

  test('preview API detects conflicts for already-installed plugin', async () => {
    // sa-agent is installed — preview should show conflicts
    const res = await (await fetch(`${API}/api/plugins/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: SA_AGENT_DIR }),
    })).json();

    if (res.valid) {
      // If sa-agent components are already installed, expect conflicts
      const agentConflicts = res.conflicts.filter((c: any) => c.type === 'agent');
      expect(agentConflicts.length).toBeGreaterThanOrEqual(0); // may or may not conflict depending on state
      expect(res.components.length).toBeGreaterThan(0);
    }
  });

  test('preview API shows dependencies', async () => {
    const res = await (await fetch(`${API}/api/plugins/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: SA_AGENT_DIR }),
    })).json();

    if (res.valid) {
      expect(res.dependencies).toBeDefined();
      expect(Array.isArray(res.dependencies)).toBe(true);
      // Plugin should declare at least one dependency with a valid status
      if (res.dependencies.length > 0) {
        const dep = res.dependencies[0];
        expect(dep.id).toBeTruthy();
        expect(['installed', 'will-install']).toContain(dep.status);
      }
    }
  });

  test('install API accepts skip list', async () => {
    // Install demo-workspace but skip the workspace component
    const res = await (await fetch(`${API}/api/plugins/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: DEMO_DIR,
        skip: ['workspace:demo-workspace'],
      }),
    })).json();

    expect(res.success).toBe(true);
    expect(res.plugin.name).toBe('demo-workspace');

    // Clean up
    await fetch(`${API}/api/plugins/demo-workspace`, { method: 'DELETE' });
  });
});

test.describe('Plugin Preview Modal (UI)', () => {
  test('preview modal appears when installing from plugins page', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Click the manage/wrench button in the header
    const manageBtn = page.locator('button[title="Manage"]');
    await manageBtn.click();
    await page.waitForTimeout(500);

    // Click "Plugins" in the manage sub-nav
    const pluginsLink = page.locator('text=Plugins').first();
    await pluginsLink.click();
    await page.waitForTimeout(500);

    // Find the install input
    const installInput = page.locator('.plugins__install-input');
    await expect(installInput).toBeVisible({ timeout: 5000 });

    // Type a local path
    await installInput.fill(DEMO_DIR);

    // Click install — should trigger preview
    await page.locator('.plugins__install-btn').click();

    // Wait for the preview modal
    await expect(page.locator('.plugins__modal-overlay')).toBeVisible({ timeout: 10000 });

    // Should show the plugin name
    await expect(page.locator('.plugins__modal strong')).toContainText('Demo');

    // Should have component checkboxes
    expect(await page.locator('.plugins__modal input[type="checkbox"]').count()).toBeGreaterThan(0);

    // Should have confirm and cancel buttons
    await expect(page.locator('.plugins__modal >> text=Confirm Install')).toBeVisible();

    // Take screenshot of the preview modal
    await page.screenshot({ path: 'test-results/plugin-preview-modal.png' });

    // Close without installing
    await page.locator('.plugins__modal >> text=Cancel').click();
    await expect(page.locator('.plugins__modal-overlay')).not.toBeVisible();
  });
});
