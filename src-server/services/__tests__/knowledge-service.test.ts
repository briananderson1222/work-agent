import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  knowledgeOps: { add: vi.fn() },
}));
vi.mock('@stallion-ai/contracts/knowledge', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@stallion-ai/contracts/knowledge')>();
  return {
    ...actual,
    BUILTIN_KNOWLEDGE_NAMESPACES: [
      { id: 'default', label: 'Default', behavior: 'rag' },
    ],
  };
});

const { KnowledgeService } = await import('../knowledge-service.js');

function createMockStorageAdapter() {
  const projects = new Map<string, any>([
    ['test', { slug: 'test', name: 'Test', knowledgeNamespaces: [] }],
  ]);
  return {
    getProject: vi.fn((slug: string) => {
      const p = projects.get(slug);
      if (!p) throw new Error('Not found');
      return { ...p };
    }),
    saveProject: vi.fn((p: any) => projects.set(p.slug, p)),
  };
}

function createMockVectorDb() {
  const namespaces = new Map<string, any[]>();
  return {
    namespaceExists: vi.fn(async (ns: string) => namespaces.has(ns)),
    createNamespace: vi.fn(async (ns: string) => namespaces.set(ns, [])),
    addDocuments: vi.fn(async (ns: string, docs: any[]) => {
      const existing = namespaces.get(ns) ?? [];
      namespaces.set(ns, [...existing, ...docs]);
    }),
    deleteDocuments: vi.fn(async (ns: string, ids: string[]) => {
      const existing = namespaces.get(ns) ?? [];
      namespaces.set(
        ns,
        existing.filter((d) => !ids.includes(d.id)),
      );
    }),
    search: vi.fn(async () => []),
    getByMetadata: vi.fn(async () => []),
  };
}

function createMockEmbedding() {
  return {
    embed: vi.fn(async (texts: string[]) =>
      texts.map(() => new Array(1024).fill(0)),
    ),
  };
}

describe('KnowledgeService — namespace management', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'knowledge-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('listNamespaces returns builtins without storage adapter', () => {
    const svc = new KnowledgeService(
      () => null,
      () => null,
      dir,
    );
    const ns = svc.listNamespaces('test');
    expect(ns.some((n) => n.id === 'default')).toBe(true);
  });

  test('listNamespaces merges builtins with project namespaces', () => {
    const adapter = createMockStorageAdapter();
    adapter.getProject.mockReturnValue({
      slug: 'test',
      knowledgeNamespaces: [{ id: 'code', label: 'Code', behavior: 'rag' }],
    });
    const svc = new KnowledgeService(
      () => null,
      () => null,
      dir,
      adapter as any,
    );
    const ns = svc.listNamespaces('test');
    expect(ns.find((n) => n.id === 'default')).toBeDefined();
    expect(ns.find((n) => n.id === 'code')).toBeDefined();
  });

  test('registerNamespace adds to project', () => {
    const adapter = createMockStorageAdapter();
    const svc = new KnowledgeService(
      () => null,
      () => null,
      dir,
      adapter as any,
    );
    svc.registerNamespace('test', {
      id: 'docs',
      label: 'Docs',
      behavior: 'inject',
    } as any);
    expect(adapter.saveProject).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledgeNamespaces: expect.arrayContaining([
          expect.objectContaining({ id: 'docs' }),
        ]),
      }),
    );
  });

  test('registerNamespace is idempotent', () => {
    const adapter = createMockStorageAdapter();
    adapter.getProject.mockReturnValue({
      slug: 'test',
      knowledgeNamespaces: [{ id: 'docs', label: 'Docs', behavior: 'rag' }],
    });
    const svc = new KnowledgeService(
      () => null,
      () => null,
      dir,
      adapter as any,
    );
    svc.registerNamespace('test', {
      id: 'docs',
      label: 'Docs',
      behavior: 'rag',
    } as any);
    expect(adapter.saveProject).not.toHaveBeenCalled();
  });

  test('removeNamespace removes custom namespace', () => {
    const adapter = createMockStorageAdapter();
    adapter.getProject.mockReturnValue({
      slug: 'test',
      knowledgeNamespaces: [{ id: 'custom', label: 'Custom', behavior: 'rag' }],
    });
    const svc = new KnowledgeService(
      () => null,
      () => null,
      dir,
      adapter as any,
    );
    svc.removeNamespace('test', 'custom');
    expect(adapter.saveProject).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledgeNamespaces: [],
      }),
    );
  });

  test('removeNamespace throws for builtin', () => {
    const adapter = createMockStorageAdapter();
    const svc = new KnowledgeService(
      () => null,
      () => null,
      dir,
      adapter as any,
    );
    expect(() => svc.removeNamespace('test', 'default')).toThrow('built-in');
  });

  test('updateNamespace modifies existing', () => {
    const adapter = createMockStorageAdapter();
    adapter.getProject.mockReturnValue({
      slug: 'test',
      knowledgeNamespaces: [{ id: 'code', label: 'Code', behavior: 'rag' }],
    });
    const svc = new KnowledgeService(
      () => null,
      () => null,
      dir,
      adapter as any,
    );
    svc.updateNamespace('test', 'code', { label: 'Source Code' });
    expect(adapter.saveProject).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledgeNamespaces: [
          expect.objectContaining({ id: 'code', label: 'Source Code' }),
        ],
      }),
    );
  });

  test('updateNamespace throws for unknown non-builtin', () => {
    const adapter = createMockStorageAdapter();
    adapter.getProject.mockReturnValue({
      slug: 'test',
      knowledgeNamespaces: [],
    });
    const svc = new KnowledgeService(
      () => null,
      () => null,
      dir,
      adapter as any,
    );
    expect(() =>
      svc.updateNamespace('test', 'nonexistent', { label: 'X' }),
    ).toThrow('not found');
  });

  test('throws without storage adapter for write operations', () => {
    const svc = new KnowledgeService(
      () => null,
      () => null,
      dir,
    );
    expect(() => svc.registerNamespace('test', {} as any)).toThrow(
      'Storage adapter required',
    );
    expect(() => svc.removeNamespace('test', 'x')).toThrow(
      'Storage adapter required',
    );
  });
});

describe('KnowledgeService — file-first document operations', () => {
  let dir: string;
  let vectorDb: ReturnType<typeof createMockVectorDb>;
  let embedding: ReturnType<typeof createMockEmbedding>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'knowledge-test-'));
    vectorDb = createMockVectorDb();
    embedding = createMockEmbedding();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('uploadDocument writes file to disk first', async () => {
    const svc = new KnowledgeService(
      () => vectorDb as any,
      () => embedding as any,
      dir,
    );
    const meta = await svc.uploadDocument(
      'test',
      'test.md',
      '# Hello\n\nWorld',
    );
    expect(meta.path).toBe('test.md');
    expect(meta.id).toBeDefined();

    // File should exist on disk
    const filePath = join(
      dir,
      'projects',
      'test',
      'knowledge',
      'default',
      'files',
      'test.md',
    );
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('# Hello\n\nWorld');
  });

  test('uploadDocument parses frontmatter into metadata', async () => {
    const svc = new KnowledgeService(
      () => vectorDb as any,
      () => embedding as any,
      dir,
    );
    const content = '---\ntitle: Test\ntags: [a, b]\n---\n# Body';
    const meta = await svc.uploadDocument('test', 'note.md', content);
    expect(meta.metadata?.title).toBe('Test');
    expect(meta.metadata?.tags).toEqual(['a', 'b']);
  });

  test('uploadDocument chunks body only, not frontmatter', async () => {
    const svc = new KnowledgeService(
      () => vectorDb as any,
      () => embedding as any,
      dir,
    );
    const content = '---\ntitle: Secret\n---\n# Body content';
    await svc.uploadDocument('test', 'note.md', content);
    // Embedding should be called with body only
    const embeddedTexts = embedding.embed.mock.calls[0][0];
    expect(embeddedTexts.every((t: string) => !t.includes('Secret'))).toBe(
      true,
    );
    expect(embeddedTexts.some((t: string) => t.includes('Body content'))).toBe(
      true,
    );
  });

  test('getDocumentContent reads from disk', async () => {
    const svc = new KnowledgeService(
      () => vectorDb as any,
      () => embedding as any,
      dir,
    );
    const meta = await svc.uploadDocument('test', 'test.md', '# Hello');
    const content = await svc.getDocumentContent('test', meta.id, 'default');
    expect(content).toBe('# Hello');
  });

  test('deleteDocument removes file from disk', async () => {
    const svc = new KnowledgeService(
      () => vectorDb as any,
      () => embedding as any,
      dir,
    );
    const meta = await svc.uploadDocument('test', 'test.md', '# Hello');
    const filePath = join(
      dir,
      'projects',
      'test',
      'knowledge',
      'default',
      'files',
      'test.md',
    );
    expect(existsSync(filePath)).toBe(true);

    await svc.deleteDocument('test', meta.id, 'default');
    expect(existsSync(filePath)).toBe(false);

    const docs = await svc.listDocuments('test', 'default');
    expect(docs).toHaveLength(0);
  });

  test('updateDocument preserves ID and re-indexes', async () => {
    const svc = new KnowledgeService(
      () => vectorDb as any,
      () => embedding as any,
      dir,
    );
    const meta = await svc.uploadDocument('test', 'test.md', '# Hello');
    const updated = await svc.updateDocument(
      'test',
      meta.id,
      { content: '# Updated', metadata: { status: 'enhanced' } },
      'default',
    );
    expect(updated.id).toBe(meta.id);
    expect(updated.updatedAt).toBeDefined();
    expect(updated.metadata?.status).toBe('enhanced');

    // File on disk should be updated with frontmatter
    const filePath = join(
      dir,
      'projects',
      'test',
      'knowledge',
      'default',
      'files',
      'test.md',
    );
    const fileContent = readFileSync(filePath, 'utf-8');
    expect(fileContent).toContain('status: enhanced');
    expect(fileContent).toContain('# Updated');
  });

  test('listDocuments with filter', async () => {
    const svc = new KnowledgeService(
      () => vectorDb as any,
      () => embedding as any,
      dir,
    );
    await svc.uploadDocument('test', 'a.md', '---\ntags: [planning]\n---\n# A');
    await svc.uploadDocument('test', 'b.md', '---\ntags: [research]\n---\n# B');

    const all = await svc.listDocuments('test', 'default');
    expect(all).toHaveLength(2);

    const filtered = await svc.listDocuments('test', 'default', {
      tags: ['planning'],
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].filename).toBe('a.md');
  });

  test('getDirectoryTree returns hierarchy', async () => {
    const svc = new KnowledgeService(
      () => vectorDb as any,
      () => embedding as any,
      dir,
    );
    await svc.uploadDocument('test', 'test.md', '# Hello');
    const tree = svc.getDirectoryTree('test', 'default');
    expect(tree.type).toBe('directory');
    expect(tree.fileCount).toBe(1);
    expect(tree.children?.some((c) => c.name === 'test.md')).toBe(true);
  });
});
