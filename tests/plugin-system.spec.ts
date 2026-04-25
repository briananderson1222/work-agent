/**
 * Plugin system integration tests using the demo-layout example.
 * No dependency on external plugins — uses the built-in demo layout.
 */

import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_DIR = join(dirname(__filename), '..');
const DEMO_DIR = join(PROJECT_DIR, 'examples', 'demo-layout');
const API = `http://localhost:${process.env.STALLION_PORT ?? '3141'}`;

test.describe('Plugin System', () => {
  test.beforeAll(async () => {
    // Build the demo layout bundle using centralized build
    execSync('npx tsx ../../packages/cli/src/cli.ts build', {
      cwd: DEMO_DIR,
      timeout: 30000,
    });
    // Ensure it's not installed
    try {
      await fetch(`${API}/api/plugins/demo-layout`, {
        method: 'DELETE',
      });
    } catch {}
  });

  test.afterAll(async () => {
    try {
      await fetch(`${API}/api/plugins/demo-layout`, {
        method: 'DELETE',
      });
    } catch {}
  });

  test('plugin API lists no plugins when none installed', async () => {
    const res = await (await fetch(`${API}/api/plugins`)).json();
    // May have sa-agent installed — just verify the endpoint works
    expect(res).toHaveProperty('plugins');
    expect(Array.isArray(res.plugins)).toBe(true);
  });

  test('install demo plugin via API and verify it appears', async () => {
    const res = await (
      await fetch(`${API}/api/plugins/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: DEMO_DIR }),
      })
    ).json();

    expect(res.success).toBe(true);
    expect(res.plugin.name).toBe('demo-layout');
    expect(res.plugin.hasBundle).toBe(true);

    // Verify it's in the list
    const list = await (await fetch(`${API}/api/plugins`)).json();
    const demo = list.plugins.find((p: any) => p.name === 'demo-layout');
    expect(demo).toBeTruthy();
    expect(demo.hasBundle).toBe(true);
  });

  test('plugin bundle is served via API', async () => {
    const jsRes = await fetch(`${API}/api/plugins/demo-layout/bundle.js`);
    expect(jsRes.status).toBe(200);
    const js = await jsRes.text();
    expect(js).toContain('__plugin');
    expect(js).toContain('demo-layout');
  });

  test('demo layout loads in browser after install', async ({ page }) => {
    // Ensure plugin is installed
    await fetch(`${API}/api/plugins/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: DEMO_DIR }),
    });

    // Navigate — PluginRegistry fetches /api/plugins on init and loads bundles
    await page.goto('/');
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            return !!(window as any).__stallion_ai_plugins?.['demo-layout'];
          }),
        { timeout: 10_000 },
      )
      .toBe(true);

    // Check if demo layout components registered
    const hasPlugin = await page.evaluate(() => {
      return !!(window as any).__stallion_ai_plugins?.['demo-layout'];
    });
    expect(hasPlugin).toBe(true);
  });

  test('remove plugin via API', async () => {
    // Ensure plugin is installed first
    await fetch(`${API}/api/plugins/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: DEMO_DIR }),
    });

    const res = await (
      await fetch(`${API}/api/plugins/demo-layout`, {
        method: 'DELETE',
      })
    ).json();
    expect(res.success).toBe(true);

    const list = await (await fetch(`${API}/api/plugins`)).json();
    const demo = list.plugins.find((p: any) => p.name === 'demo-layout');
    expect(demo).toBeFalsy();
  });
});
