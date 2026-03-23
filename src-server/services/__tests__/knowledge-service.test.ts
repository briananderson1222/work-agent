import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  knowledgeOps: { add: vi.fn() },
}));
vi.mock('@stallion-ai/shared', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    BUILTIN_KNOWLEDGE_NAMESPACES: [{ id: 'default', label: 'Default', behavior: 'rag' }],
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

describe('KnowledgeService — namespace management', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'knowledge-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('listNamespaces returns builtins without storage adapter', () => {
    const svc = new KnowledgeService(() => null, () => null, dir);
    const ns = svc.listNamespaces('test');
    expect(ns.some((n) => n.id === 'default')).toBe(true);
  });

  test('listNamespaces merges builtins with project namespaces', () => {
    const adapter = createMockStorageAdapter();
    adapter.getProject.mockReturnValue({ slug: 'test', knowledgeNamespaces: [{ id: 'code', label: 'Code', behavior: 'rag' }] });
    const svc = new KnowledgeService(() => null, () => null, dir, adapter as any);
    const ns = svc.listNamespaces('test');
    expect(ns.find((n) => n.id === 'default')).toBeDefined();
    expect(ns.find((n) => n.id === 'code')).toBeDefined();
  });

  test('registerNamespace adds to project', () => {
    const adapter = createMockStorageAdapter();
    const svc = new KnowledgeService(() => null, () => null, dir, adapter as any);
    svc.registerNamespace('test', { id: 'docs', label: 'Docs', behavior: 'inject' } as any);
    expect(adapter.saveProject).toHaveBeenCalledWith(expect.objectContaining({
      knowledgeNamespaces: expect.arrayContaining([expect.objectContaining({ id: 'docs' })]),
    }));
  });

  test('registerNamespace is idempotent', () => {
    const adapter = createMockStorageAdapter();
    adapter.getProject.mockReturnValue({ slug: 'test', knowledgeNamespaces: [{ id: 'docs', label: 'Docs', behavior: 'rag' }] });
    const svc = new KnowledgeService(() => null, () => null, dir, adapter as any);
    svc.registerNamespace('test', { id: 'docs', label: 'Docs', behavior: 'rag' } as any);
    expect(adapter.saveProject).not.toHaveBeenCalled();
  });

  test('removeNamespace removes custom namespace', () => {
    const adapter = createMockStorageAdapter();
    adapter.getProject.mockReturnValue({ slug: 'test', knowledgeNamespaces: [{ id: 'custom', label: 'Custom', behavior: 'rag' }] });
    const svc = new KnowledgeService(() => null, () => null, dir, adapter as any);
    svc.removeNamespace('test', 'custom');
    expect(adapter.saveProject).toHaveBeenCalledWith(expect.objectContaining({
      knowledgeNamespaces: [],
    }));
  });

  test('removeNamespace throws for builtin', () => {
    const adapter = createMockStorageAdapter();
    const svc = new KnowledgeService(() => null, () => null, dir, adapter as any);
    expect(() => svc.removeNamespace('test', 'default')).toThrow('built-in');
  });

  test('updateNamespace modifies existing', () => {
    const adapter = createMockStorageAdapter();
    adapter.getProject.mockReturnValue({ slug: 'test', knowledgeNamespaces: [{ id: 'code', label: 'Code', behavior: 'rag' }] });
    const svc = new KnowledgeService(() => null, () => null, dir, adapter as any);
    svc.updateNamespace('test', 'code', { label: 'Source Code' });
    expect(adapter.saveProject).toHaveBeenCalledWith(expect.objectContaining({
      knowledgeNamespaces: [expect.objectContaining({ id: 'code', label: 'Source Code' })],
    }));
  });

  test('updateNamespace throws for unknown non-builtin', () => {
    const adapter = createMockStorageAdapter();
    adapter.getProject.mockReturnValue({ slug: 'test', knowledgeNamespaces: [] });
    const svc = new KnowledgeService(() => null, () => null, dir, adapter as any);
    expect(() => svc.updateNamespace('test', 'nonexistent', { label: 'X' })).toThrow('not found');
  });

  test('throws without storage adapter for write operations', () => {
    const svc = new KnowledgeService(() => null, () => null, dir);
    expect(() => svc.registerNamespace('test', {} as any)).toThrow('Storage adapter required');
    expect(() => svc.removeNamespace('test', 'x')).toThrow('Storage adapter required');
  });
});
