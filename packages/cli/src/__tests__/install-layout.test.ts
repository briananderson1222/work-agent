import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { applyInstalledPluginLayout } from '../commands/install-layout.js';

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupDirs.splice(0, cleanupDirs.length).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

function createProjectHome() {
  const root = mkdtempSync(join(tmpdir(), 'stallion-install-layout-'));
  cleanupDirs.push(root);
  return root;
}

describe('applyInstalledPluginLayout', () => {
  test('applies a plugin layout to the selected project', () => {
    const projectHome = createProjectHome();
    const pluginDir = join(projectHome, 'plugins', 'example-plugin');
    const projectDir = join(projectHome, 'projects', 'demo');

    mkdirSync(pluginDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'project.json'), JSON.stringify({ slug: 'demo' }));
    writeFileSync(
      join(pluginDir, 'layout.json'),
      JSON.stringify({
        slug: 'example-layout',
        name: 'Example Layout',
        icon: 'L',
        tabs: [],
      }),
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    applyInstalledPluginLayout({
      finalDir: pluginDir,
      manifest: {
        name: 'example-plugin',
        version: '1.0.0',
        layout: { slug: 'example-layout', source: 'layout.json' },
      } as any,
      projectHome,
      skipSet: new Set(),
      projectArgv: ['stallion', 'install', '--project=demo'],
    });

    const saved = JSON.parse(
      readFileSync(
        join(projectDir, 'layouts', 'example-layout.json'),
        'utf-8',
      ),
    );
    expect(saved.slug).toBe('example-layout');
    expect(saved.projectSlug).toBe('demo');
    expect(saved.config.plugin).toBe('example-plugin');

    log.mockRestore();
  });

  test('does not rewrite an already-applied layout', () => {
    const projectHome = createProjectHome();
    const pluginDir = join(projectHome, 'plugins', 'example-plugin');
    const projectDir = join(projectHome, 'projects', 'demo');
    const layoutsDir = join(projectDir, 'layouts');

    mkdirSync(pluginDir, { recursive: true });
    mkdirSync(layoutsDir, { recursive: true });
    writeFileSync(join(projectDir, 'project.json'), JSON.stringify({ slug: 'demo' }));
    writeFileSync(
      join(pluginDir, 'layout.json'),
      JSON.stringify({
        slug: 'example-layout',
        name: 'Example Layout',
      }),
    );
    writeFileSync(
      join(layoutsDir, 'example-layout.json'),
      JSON.stringify({ slug: 'example-layout', projectSlug: 'demo' }),
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    applyInstalledPluginLayout({
      finalDir: pluginDir,
      manifest: {
        name: 'example-plugin',
        version: '1.0.0',
        layout: { slug: 'example-layout', source: 'layout.json' },
      } as any,
      projectHome,
      skipSet: new Set(),
      projectArgv: ['stallion', 'install', '--project=demo'],
    });

    const files = [readFileSync(join(layoutsDir, 'example-layout.json'), 'utf-8')];
    expect(files).toHaveLength(1);

    log.mockRestore();
  });
});
