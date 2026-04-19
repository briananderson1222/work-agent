import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(repoRoot, '../ai-guidance-framework');
const targetRoot = resolve(repoRoot, 'vendor/ai-guidance-framework');

if (!existsSync(sourceRoot)) {
  throw new Error(`Standalone framework repo not found at ${sourceRoot}`);
}

rmSync(targetRoot, { recursive: true, force: true });
mkdirSync(targetRoot, { recursive: true });

for (const relativePath of [
  '.gitignore',
  'AGENTS.md',
  'README.md',
  'package.json',
  'bin',
  'src',
  'docs',
  'schemas',
  'adapters',
  'policy-packs',
  'scripts',
  'tests',
]) {
  cpSync(resolve(sourceRoot, relativePath), resolve(targetRoot, relativePath), {
    recursive: true,
  });
}

console.log(`Synced ai-guidance-framework into ${targetRoot}`);
