import { describe, expect, test } from 'vitest';
import {
  applyKnowledgeScanPatterns,
  normalizeKnowledgeExtension,
  resolveKnowledgeScanPath,
} from '../knowledge-scan-utils.js';

describe('knowledge-scan-utils', () => {
  test('normalizeKnowledgeExtension preserves dotted extensions and prefixes bare ones', () => {
    expect(normalizeKnowledgeExtension('md')).toBe('.md');
    expect(normalizeKnowledgeExtension('.ts')).toBe('.ts');
  });

  test('applyKnowledgeScanPatterns applies include and exclude globs', () => {
    expect(
      applyKnowledgeScanPatterns(
        ['/repo/src/a.ts', '/repo/src/b.ts', '/repo/docs/readme.md'],
        '/repo',
        ['src/**'],
        ['**/b.ts'],
      ),
    ).toEqual(['/repo/src/a.ts']);
  });

  test('resolveKnowledgeScanPath prefers namespace storageDir/files when present', () => {
    expect(
      resolveKnowledgeScanPath(
        'proj',
        'code',
        {
          getProject: () => ({ workingDirectory: '/workspace' }),
        } as any,
        () => ({ id: 'code', label: 'Code', behavior: 'rag', storageDir: '/tmp/ns' }),
      ),
    ).toBe('/tmp/ns');
  });
});
