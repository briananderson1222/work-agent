import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { FileStorageAdapter } from '../file-storage-adapter.js';
import { runStartupMigrations } from '../migration.js';

describe('runStartupMigrations', () => {
  let tempDir = '';

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  test('renames the built-in vectordb connection to Stallion Built-In', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'migration-test-'));
    const storageAdapter = new FileStorageAdapter(tempDir);
    storageAdapter.saveProviderConnection({
      id: 'lancedb-builtin',
      type: 'lancedb',
      name: 'LanceDB (built-in)',
      config: { dataDir: join(tempDir, 'vectordb') },
      enabled: true,
      capabilities: ['vectordb'],
    });

    await runStartupMigrations(tempDir);

    const providers = storageAdapter.listProviderConnections();
    expect(
      providers.find((connection) => connection.id === 'lancedb-builtin'),
    ).toEqual(
      expect.objectContaining({
        name: 'Stallion Built-In',
      }),
    );
    expect(
      existsSync(join(tempDir, 'projects', 'default', 'project.json')),
    ).toBe(true);
  });
});
