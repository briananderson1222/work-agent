import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

const cleanupDirs: string[] = [];

afterEach(async () => {
  vi.resetModules();
  delete process.env.STALLION_AI_DIR;
  await Promise.all(
    cleanupDirs
      .splice(0, cleanupDirs.length)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe('install-registry helpers', () => {
  test('resolves relative local plugin sources against a local manifest path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stallion-registry-cli-'));
    cleanupDirs.push(root);
    const projectHome = join(root, 'home');
    const registryDir = join(root, 'registry');
    const pluginDir = join(root, 'plugins', 'demo-layout');
    mkdirSync(projectHome, { recursive: true });
    mkdirSync(registryDir, { recursive: true });
    mkdirSync(pluginDir, { recursive: true });

    const manifestPath = join(registryDir, 'plugins.json');
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          version: 1,
          plugins: [
            {
              id: 'demo-layout',
              source: '../plugins/demo-layout',
            },
          ],
          tools: [],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(projectHome, 'config.json'),
      JSON.stringify({ registryUrl: manifestPath }, null, 2),
    );

    process.env.STALLION_AI_DIR = projectHome;
    const { resolveRegistryPluginSource } = await import(
      '../commands/install-registry.js'
    );

    await expect(resolveRegistryPluginSource('demo-layout')).resolves.toBe(
      pluginDir,
    );
  });

  test('browses a local manifest and marks a curated registry id as installed via alias mapping', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stallion-registry-cli-'));
    cleanupDirs.push(root);
    const projectHome = join(root, 'home');
    const registryDir = join(root, 'registry');
    const installedPluginDir = join(projectHome, 'plugins', 'actual-plugin');
    mkdirSync(projectHome, { recursive: true });
    mkdirSync(registryDir, { recursive: true });
    mkdirSync(installedPluginDir, { recursive: true });

    const manifestPath = join(registryDir, 'plugins.json');
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          version: 1,
          plugins: [
            {
              id: 'curated-demo',
              displayName: 'Curated Demo',
              version: '1.0.0',
              description: 'Registry entry',
              source: '../plugins/actual-plugin',
            },
          ],
          tools: [],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(projectHome, 'config.json'),
      JSON.stringify({ registryUrl: manifestPath }, null, 2),
    );
    writeFileSync(
      join(installedPluginDir, 'plugin.json'),
      JSON.stringify({ name: 'actual-plugin', version: '1.0.0' }, null, 2),
    );

    process.env.STALLION_AI_DIR = projectHome;
    const { recordRegistryInstall, showOrSaveRegistry } = await import(
      '../commands/install-registry.js'
    );
    recordRegistryInstall('curated-demo', 'actual-plugin');

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    showOrSaveRegistry();

    const output = log.mock.calls.flat().join('\n');
    expect(output).toContain('Curated Demo (curated-demo@1.0.0) [installed]');
    expect(
      JSON.parse(
        readFileSync(
          join(projectHome, 'config', 'registry-installs.json'),
          'utf-8',
        ),
      ),
    ).toEqual({ 'curated-demo': 'actual-plugin' });

    log.mockRestore();
  });
});
