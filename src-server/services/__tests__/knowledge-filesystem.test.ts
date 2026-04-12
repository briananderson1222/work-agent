import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  buildKnowledgeDirectoryTree,
  listKnowledgeDocuments,
  scanKnowledgeDirectories,
} from '../knowledge-filesystem.js';
import { saveKnowledgeMeta } from '../knowledge-storage.js';

describe('knowledge-filesystem helpers', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'knowledge-filesystem-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('listKnowledgeDocuments filters by path, tags, and metadata', () => {
    const storageDir = join(dir, 'default');
    saveKnowledgeMeta(storageDir, [
      {
        id: 'doc-1',
        filename: 'docs/guide.md',
        namespace: 'default',
        path: 'docs/guide.md',
        source: 'upload',
        chunkCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        metadata: { tags: ['planning'], owner: 'ops' },
      },
      {
        id: 'doc-2',
        filename: 'notes/todo.md',
        namespace: 'default',
        path: 'notes/todo.md',
        source: 'upload',
        chunkCount: 1,
        createdAt: '2026-01-02T00:00:00.000Z',
        metadata: { tags: ['research'], owner: 'eng' },
      },
    ]);

    const docs = listKnowledgeDocuments({
      projectSlug: 'test',
      namespace: 'default',
      filter: {
        pathPrefix: 'docs/',
        tags: ['planning'],
        metadata: { owner: 'ops' },
      },
      dataDir: dir,
      listNamespaces: () => [
        { id: 'default', label: 'Default', behavior: 'rag' },
      ],
      resolveStorageDir: () => storageDir,
    });

    expect(docs).toEqual([
      expect.objectContaining({
        id: 'doc-1',
        filename: 'docs/guide.md',
      }),
    ]);
  });

  test('buildKnowledgeDirectoryTree returns nested file counts', () => {
    const storageDir = join(dir, 'default');
    mkdirSync(join(storageDir, 'files', 'docs'), { recursive: true });
    writeFileSync(join(storageDir, 'files', 'docs', 'guide.md'), '# Guide');
    writeFileSync(join(storageDir, 'files', 'root.md'), '# Root');
    saveKnowledgeMeta(storageDir, [
      {
        id: 'doc-1',
        filename: 'docs/guide.md',
        namespace: 'default',
        path: 'docs/guide.md',
        source: 'upload',
        chunkCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'doc-2',
        filename: 'root.md',
        namespace: 'default',
        path: 'root.md',
        source: 'upload',
        chunkCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const tree = buildKnowledgeDirectoryTree({
      projectSlug: 'test',
      namespace: 'default',
      dataDir: dir,
      resolveStorageDir: () => storageDir,
    });

    expect(tree).toEqual(
      expect.objectContaining({
        type: 'directory',
        fileCount: 2,
      }),
    );
    expect(tree.children?.map((child) => child.name)).toEqual([
      'docs',
      'root.md',
    ]);
    expect(tree.children?.[0]).toEqual(
      expect.objectContaining({
        type: 'directory',
        fileCount: 1,
      }),
    );
  });

  test('scanKnowledgeDirectories respects include and exclude patterns', async () => {
    const workingDirectory = join(dir, 'workspace');
    mkdirSync(join(workingDirectory, 'src'), { recursive: true });
    mkdirSync(join(workingDirectory, 'docs'), { recursive: true });
    writeFileSync(
      join(workingDirectory, 'src', 'keep.ts'),
      'export const keep = true;\n',
    );
    writeFileSync(
      join(workingDirectory, 'src', 'skip.ts'),
      'export const skip = true;\n',
    );
    writeFileSync(join(workingDirectory, 'docs', 'guide.md'), '# guide\n');

    const uploadDocument = vi.fn(async () => ({}));
    const result = await scanKnowledgeDirectories({
      projectSlug: 'test',
      namespace: 'code',
      extensions: ['ts', '.md'],
      includePatterns: ['src/**'],
      excludePatterns: ['**/skip.ts'],
      storageAdapter: {
        getProject: () => ({
          slug: 'test',
          name: 'Test',
          workingDirectory,
        }),
      } as any,
      getNamespaceConfig: () => undefined,
      uploadDocument,
    });

    expect(result).toEqual({ indexed: 1, skipped: 0 });
    expect(uploadDocument).toHaveBeenCalledWith(
      'test',
      'src/keep.ts',
      'export const keep = true;\n',
      'directory-scan',
      'code',
    );
  });
});
