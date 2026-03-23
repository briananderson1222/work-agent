import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../telemetry/metrics.js', () => ({
  fileTreeOps: { add: vi.fn() },
}));

const { FileTreeService } = await import('../file-tree-service.js');

describe('FileTreeService', () => {
  let dir: string;
  let svc: InstanceType<typeof FileTreeService>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'filetree-test-'));
    svc = new FileTreeService();
    // Create test structure
    mkdirSync(join(dir, 'src'), { recursive: true });
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(dir, 'index.ts'), 'export {}');
    writeFileSync(join(dir, 'src', 'app.ts'), 'const x = 1;');
    writeFileSync(join(dir, 'node_modules', 'pkg', 'index.js'), '');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('listDirectory returns files and directories', () => {
    const entries = svc.listDirectory(dir);
    const names = entries.map((e) => e.name);
    expect(names).toContain('index.ts');
    expect(names).toContain('src');
  });

  test('listDirectory skips node_modules', () => {
    const entries = svc.listDirectory(dir, { depth: 3 });
    const allPaths = JSON.stringify(entries);
    expect(allPaths).not.toContain('node_modules');
  });

  test('readFile returns content', () => {
    expect(svc.readFile(join(dir, 'index.ts'))).toBe('export {}');
  });

  test('readFile throws for missing file', () => {
    expect(() => svc.readFile(join(dir, 'nope.ts'))).toThrow('File not found');
  });

  test('searchFiles finds matching files', () => {
    const results = svc.searchFiles(dir, 'index');
    expect(results.some((e) => e.name === 'index.ts')).toBe(true);
  });
});
