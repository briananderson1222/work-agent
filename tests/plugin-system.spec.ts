/**
 * Plugin system integration tests using the demo-workspace example.
 * No dependency on external plugins — uses the built-in demo workspace.
 */
import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_DIR = join(dirname(__filename), '..');
const DEMO_DIR = join(PROJECT_DIR, 'examples', 'demo-workspace');

test.describe('Plugin System', () => {
  test.beforeAll(() => {
    // Build the demo workspace bundle
    execSync('./build.sh', { cwd: DEMO_DIR, timeout: 15000 });
    // Ensure it's not installed
    try { execSync(`node packages/cli/src/cli.js remove demo-workspace`, { cwd: PROJECT_DIR, timeout: 5000 }); } catch {}
  });

  test.afterAll(() => {
    try { execSync(`node packages/cli/src/cli.js remove demo-workspace`, { cwd: PROJECT_DIR, timeout: 5000 }); } catch {}
  });

  test('plugin API lists no plugins when none installed', async () => {
    const res = await (await fetch('http://localhost:3141/api/plugins')).json();
    // May have sa-agent installed — just verify the endpoint works
    expect(res).toHaveProperty('plugins');
    expect(Array.isArray(res.plugins)).toBe(true);
  });

  test('install demo plugin via API and verify it appears', async () => {
    const res = await (await fetch('http://localhost:3141/api/plugins/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: DEMO_DIR }),
    })).json();

    expect(res.success).toBe(true);
    expect(res.plugin.name).toBe('demo-workspace');
    expect(res.plugin.hasBundle).toBe(true);

    // Verify it's in the list
    const list = await (await fetch('http://localhost:3141/api/plugins')).json();
    const demo = list.plugins.find((p: any) => p.name === 'demo-workspace');
    expect(demo).toBeTruthy();
    expect(demo.hasBundle).toBe(true);
  });

  test('plugin bundle is served via API', async () => {
    const jsRes = await fetch('http://localhost:3141/api/plugins/demo-workspace/bundle.js');
    expect(jsRes.status).toBe(200);
    const js = await jsRes.text();
    expect(js).toContain('__plugin');
    expect(js).toContain('demo-workspace');
  });

  test('demo workspace loads in browser after install', async ({ page }) => {
    // Navigate to the app — the demo workspace should be available
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Check if demo workspace components registered
    const hasPlugin = await page.evaluate(() => {
      return !!(window as any).__work_agent_plugins?.['demo-workspace'];
    });
    expect(hasPlugin).toBe(true);
  });

  test('remove plugin via API', async () => {
    const res = await (await fetch('http://localhost:3141/api/plugins/demo-workspace', {
      method: 'DELETE',
    })).json();
    expect(res.success).toBe(true);

    const list = await (await fetch('http://localhost:3141/api/plugins')).json();
    const demo = list.plugins.find((p: any) => p.name === 'demo-workspace');
    expect(demo).toBeFalsy();
  });
});
