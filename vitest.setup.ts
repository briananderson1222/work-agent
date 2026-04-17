import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (!process.env.STALLION_AI_DIR) {
  const testHomeDir = mkdtempSync(join(tmpdir(), 'stallion-vitest-home-'));
  process.env.STALLION_AI_DIR = testHomeDir;

  process.on('exit', () => {
    rmSync(testHomeDir, { recursive: true, force: true });
  });
}
