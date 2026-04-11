import { describe, expect, test, vi } from 'vitest';
import { searchKnowledgeDocuments } from '../knowledge-search.js';

describe('knowledge-search helpers', () => {
  test('searches a single namespace when requested', async () => {
    const search = vi.fn().mockResolvedValue([{ id: 'chunk-1', score: 0.7 }]);

    await expect(
      searchKnowledgeDocuments({
        projectSlug: 'project-a',
        query: 'hello',
        topK: 3,
        namespace: 'docs',
        vectorDb: {
          namespaceExists: vi.fn().mockResolvedValue(true),
          search,
        },
        embeddingProvider: {
          embed: vi.fn().mockResolvedValue([[1, 2, 3]]),
        },
        listNamespaces: vi.fn(),
      }),
    ).resolves.toEqual([{ id: 'chunk-1', score: 0.7 }]);

    expect(search).toHaveBeenCalledWith('project-project-a:docs', [1, 2, 3], 3);
  });

  test('fans out over rag namespaces and returns top scored results', async () => {
    const namespaceExists = vi.fn().mockResolvedValue(true);
    const search = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'a', score: 0.2 }])
      .mockResolvedValueOnce([
        { id: 'b', score: 0.9 },
        { id: 'c', score: 0.6 },
      ]);

    await expect(
      searchKnowledgeDocuments({
        projectSlug: 'project-a',
        query: 'hello',
        topK: 2,
        vectorDb: { namespaceExists, search },
        embeddingProvider: {
          embed: vi.fn().mockResolvedValue([[4, 5, 6]]),
        },
        listNamespaces: () => [
          { id: 'rag-a', behavior: 'rag' },
          { id: 'inject-a', behavior: 'inject' },
          { id: 'rag-b', behavior: 'rag' },
        ],
      }),
    ).resolves.toEqual([
      { id: 'b', score: 0.9 },
      { id: 'c', score: 0.6 },
    ]);

    expect(namespaceExists).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenCalledTimes(2);
  });

  test('returns empty when required providers are missing', async () => {
    await expect(
      searchKnowledgeDocuments({
        projectSlug: 'project-a',
        query: 'hello',
        topK: 3,
        vectorDb: null,
        embeddingProvider: {
          embed: vi.fn(),
        },
        listNamespaces: vi.fn(),
      }),
    ).resolves.toEqual([]);

    await expect(
      searchKnowledgeDocuments({
        projectSlug: 'project-a',
        query: 'hello',
        topK: 3,
        vectorDb: {
          namespaceExists: vi.fn(),
          search: vi.fn(),
        },
        embeddingProvider: null,
        listNamespaces: vi.fn(),
      }),
    ).resolves.toEqual([]);
  });
});
