import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  createIntegrationRegistryProvider,
  mergeRegistryItems,
  readDiskIntegrations,
} from '../integration-registry-provider.js';

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupDirs
      .splice(0, cleanupDirs.length)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

function createHomeDir() {
  const root = mkdtempSync(join(tmpdir(), 'stallion-integration-registry-'));
  cleanupDirs.push(root);
  return root;
}

describe('integration-registry-provider helpers', () => {
  test('mergeRegistryItems prefers disk items when ids overlap', () => {
    expect(
      mergeRegistryItems(
        [{ id: 'tool-1', displayName: 'Disk Tool' } as any],
        [
          { id: 'tool-1', displayName: 'Provider Tool' } as any,
          { id: 'tool-2', displayName: 'Other Tool' } as any,
        ],
      ),
    ).toEqual([
      { id: 'tool-1', displayName: 'Disk Tool' },
      { id: 'tool-2', displayName: 'Other Tool' },
    ]);
  });

  test('readDiskIntegrations returns installed items from the integrations directory', () => {
    const homeDir = createHomeDir();
    const integrationDir = join(homeDir, 'integrations', 'demo-tool');
    mkdirSync(integrationDir, { recursive: true });
    writeFileSync(
      join(integrationDir, 'integration.json'),
      JSON.stringify({
        id: 'demo-tool',
        displayName: 'Demo Tool',
        description: 'Demo',
      }),
    );

    const items = readDiskIntegrations(homeDir);
    expect(items).toEqual([
      {
        id: 'demo-tool',
        displayName: 'Demo Tool',
        description: 'Demo',
        installed: true,
        status: 'missing binary',
      },
    ]);
  });

  test('createIntegrationRegistryProvider merges disk and provider items', async () => {
    const homeDir = createHomeDir();
    const integrationDir = join(homeDir, 'integrations', 'demo-tool');
    mkdirSync(integrationDir, { recursive: true });
    writeFileSync(
      join(integrationDir, 'integration.json'),
      JSON.stringify({
        id: 'demo-tool',
        displayName: 'Demo Tool',
      }),
    );

    const provider = {
      listAvailable: vi
        .fn()
        .mockResolvedValue([
          { id: 'provider-tool', displayName: 'Provider Tool' },
        ]),
      listInstalled: vi.fn().mockResolvedValue([]),
      install: vi.fn().mockResolvedValue({ success: true }),
      uninstall: vi.fn().mockResolvedValue({ success: true }),
      getToolDef: vi.fn().mockResolvedValue(null),
      sync: vi.fn().mockResolvedValue(undefined),
    };

    const registry = createIntegrationRegistryProvider(
      [provider] as any,
      homeDir,
    );

    await expect(registry.listAvailable()).resolves.toEqual([
      {
        id: 'demo-tool',
        displayName: 'Demo Tool',
        description: '',
        installed: true,
        status: 'missing binary',
      },
      { id: 'provider-tool', displayName: 'Provider Tool' },
    ]);
  });
});
