import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

const cleanupDirs: string[] = [];

afterEach(async () => {
  vi.resetModules();
  await Promise.all(
    cleanupDirs
      .splice(0, cleanupDirs.length)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function importCommands() {
  return import('../commands/init.js');
}

describe('createPlugin', () => {
  test('creates the default full template scaffold', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stallion-create-plugin-'));
    cleanupDirs.push(root);

    const { createPlugin } = await importCommands();
    createPlugin('alpha-plugin', { cwd: root });

    const pluginDir = join(root, 'alpha-plugin');
    const manifest = JSON.parse(
      readFileSync(join(pluginDir, 'plugin.json'), 'utf-8'),
    );
    const layout = JSON.parse(
      readFileSync(join(pluginDir, 'layout.json'), 'utf-8'),
    );

    expect(existsSync(join(pluginDir, 'src', 'index.tsx'))).toBe(true);
    expect(
      existsSync(join(pluginDir, 'agents', 'assistant', 'agent.json')),
    ).toBe(true);
    expect(manifest.entrypoint).toBe('src/index.tsx');
    expect(manifest.layout.slug).toBe('alpha-plugin');
    expect(layout.defaultAgent).toBe('alpha-plugin:assistant');
  });

  test('creates a layout template without agent scaffolding', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stallion-create-plugin-'));
    cleanupDirs.push(root);

    const { createPlugin } = await importCommands();
    createPlugin('layout-only', { cwd: root, template: 'layout' });

    const pluginDir = join(root, 'layout-only');
    const manifest = JSON.parse(
      readFileSync(join(pluginDir, 'plugin.json'), 'utf-8'),
    );

    expect(existsSync(join(pluginDir, 'layout.json'))).toBe(true);
    expect(existsSync(join(pluginDir, 'agents'))).toBe(false);
    expect(manifest.agents).toBeUndefined();
    expect(manifest.entrypoint).toBe('src/index.tsx');
  });

  test('creates a provider template with a server module and provider files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stallion-create-plugin-'));
    cleanupDirs.push(root);

    const { createPlugin } = await importCommands();
    createPlugin('provider-kit', { cwd: root, template: 'provider' });

    const pluginDir = join(root, 'provider-kit');
    const manifest = JSON.parse(
      readFileSync(join(pluginDir, 'plugin.json'), 'utf-8'),
    );

    expect(existsSync(join(pluginDir, 'plugin.mjs'))).toBe(true);
    expect(existsSync(join(pluginDir, 'providers', 'branding.js'))).toBe(true);
    expect(existsSync(join(pluginDir, 'src', 'index.tsx'))).toBe(false);
    expect(manifest.serverModule).toBe('plugin.mjs');
    expect(manifest.providers[0].type).toBe('branding');
  });
});
