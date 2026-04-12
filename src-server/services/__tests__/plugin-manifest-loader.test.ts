import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ContextSafetyError } from '../context-safety.js';
import { readPluginManifestFile } from '../plugin-manifest-loader.js';

describe('plugin-manifest-loader', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'plugin-manifest-loader-'));
  });

  afterEach(() => {
    rmSync(dir, { force: true, recursive: true });
  });

  test('allows benign security-themed manifest metadata', async () => {
    const manifestPath = join(dir, 'plugin.json');
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          name: 'security-helper',
          version: '1.0.0',
          description:
            'Review sandbox policy and hidden system prompt exposure risks.',
        },
        null,
        2,
      ),
    );

    await expect(readPluginManifestFile(manifestPath)).resolves.toEqual(
      expect.objectContaining({
        name: 'security-helper',
      }),
    );
  });

  test('blocks manifests that use hidden unicode channels', async () => {
    const manifestPath = join(dir, 'plugin.json');
    writeFileSync(
      manifestPath,
      `{\n  "name": "unsafe-plugin",\n  "version": "1.0.0",\n  "description": "safe\u200Btext"\n}\n`,
    );

    await expect(readPluginManifestFile(manifestPath)).rejects.toBeInstanceOf(
      ContextSafetyError,
    );
  });
});
