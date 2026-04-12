import { describe, expect, it, vi } from 'vitest';
import {
  getKnowledgeNamespaceConfig,
  listKnowledgeNamespaces,
  registerKnowledgeNamespace,
  removeKnowledgeNamespace,
  resolveKnowledgeStorageDir,
  updateKnowledgeNamespace,
} from '../knowledge-namespaces.js';

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

function createStorageAdapter() {
  const projects = new Map<string, any>([
    ['test', { slug: 'test', knowledgeNamespaces: [] }],
  ]);
  return {
    getProject: vi.fn((slug: string) => {
      const project = projects.get(slug);
      if (!project) throw new Error('Not found');
      return { ...project };
    }),
    saveProject: vi.fn((project: any) => projects.set(project.slug, project)),
  };
}

describe('knowledge namespaces helpers', () => {
  it('lists, resolves, and deduplicates namespaces', () => {
    const storage = createStorageAdapter();
    storage.getProject.mockReturnValue({
      slug: 'test',
      knowledgeNamespaces: [
        { id: 'default', label: 'Override', behavior: 'rag' },
        { id: 'docs', label: 'Docs', behavior: 'inject' },
      ],
    });

    expect(listKnowledgeNamespaces('test', storage as any)).toEqual([
      { id: 'default', label: 'Default', behavior: 'rag' },
      { id: 'docs', label: 'Docs', behavior: 'inject' },
    ]);
    expect(getKnowledgeNamespaceConfig('test', 'docs', storage as any)).toEqual(
      { id: 'docs', label: 'Docs', behavior: 'inject' },
    );
    expect(
      resolveKnowledgeStorageDir('test', 'docs', '/tmp/data', storage as any),
    ).toContain('/tmp/data/projects/test/knowledge/docs');
  });

  it('registers, updates, and removes custom namespaces', () => {
    const storage = createStorageAdapter();

    registerKnowledgeNamespace(
      'test',
      { id: 'docs', label: 'Docs', behavior: 'inject' },
      storage as any,
    );
    expect(storage.saveProject).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledgeNamespaces: [
          { id: 'docs', label: 'Docs', behavior: 'inject' },
        ],
      }),
    );

    updateKnowledgeNamespace(
      'test',
      'docs',
      { label: 'Documentation' },
      storage as any,
    );
    expect(storage.saveProject).toHaveBeenLastCalledWith(
      expect.objectContaining({
        knowledgeNamespaces: [
          { id: 'docs', label: 'Documentation', behavior: 'inject' },
        ],
      }),
    );

    removeKnowledgeNamespace('test', 'docs', storage as any);
    expect(storage.saveProject).toHaveBeenLastCalledWith(
      expect.objectContaining({
        knowledgeNamespaces: [],
      }),
    );
  });
});
