import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  knowledgeOps: { add: vi.fn() },
}));

const { createKnowledgeRoutes } = await import('../knowledge.js');

function createMockKnowledgeService() {
  const docs = [
    {
      id: 'd1',
      filename: 'test.md',
      path: 'test.md',
      chunkCount: 3,
      createdAt: '2026-01-01',
    },
  ];
  return {
    listDocuments: vi.fn().mockResolvedValue(docs),
    uploadDocument: vi.fn().mockResolvedValue({
      id: 'd2',
      filename: 'new.md',
      path: 'new.md',
      chunkCount: 1,
    }),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    searchDocuments: vi
      .fn()
      .mockResolvedValue([{ id: 'd1', score: 0.9, content: 'match' }]),
    getDocumentContent: vi.fn().mockResolvedValue('# Hello'),
    scanDirectories: vi.fn().mockResolvedValue({ scanned: 5, indexed: 3 }),
    updateDocument: vi.fn().mockResolvedValue({
      id: 'd1',
      filename: 'test.md',
      path: 'test.md',
      chunkCount: 2,
      updatedAt: '2026-01-02',
    }),
    getDirectoryTree: vi.fn().mockReturnValue({
      name: 'notes',
      path: '.',
      type: 'directory',
      fileCount: 1,
      children: [
        { name: 'test.md', path: 'test.md', type: 'file', doc: docs[0] },
      ],
    }),
    listNamespaces: vi
      .fn()
      .mockReturnValue([{ id: 'default', label: 'Default', behavior: 'rag' }]),
    registerNamespace: vi.fn(),
    removeNamespace: vi.fn(),
    updateNamespace: vi.fn(),
  };
}

async function json(res: Response) {
  return res.json();
}

describe('Knowledge Routes', () => {
  test('GET / lists documents', async () => {
    const app = createKnowledgeRoutes(createMockKnowledgeService() as any);
    const body = await json(await app.request('/'));
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('GET / with filter params passes filter to service', async () => {
    const svc = createMockKnowledgeService();
    const app = createKnowledgeRoutes(svc as any);
    await app.request(
      '/ns/notes?tags=planning&metadata.accountId=123&pathPrefix=gf-c-08',
    );
    expect(svc.listDocuments).toHaveBeenCalledWith(
      expect.any(String),
      'notes',
      expect.objectContaining({
        tags: ['planning'],
        pathPrefix: 'gf-c-08',
        metadata: { accountId: '123' },
      }),
    );
  });

  test('GET /status returns stats', async () => {
    const app = createKnowledgeRoutes(createMockKnowledgeService() as any);
    const body = await json(await app.request('/status'));
    expect(body.success).toBe(true);
    expect(body.data.documentCount).toBe(1);
    expect(body.data.totalChunks).toBe(3);
  });

  test('POST /upload creates document', async () => {
    const app = createKnowledgeRoutes(createMockKnowledgeService() as any);
    const res = await app.request('/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'new.md', content: '# New' }),
    });
    expect(res.status).toBe(201);
  });

  test('POST /upload returns 400 without filename', async () => {
    const app = createKnowledgeRoutes(createMockKnowledgeService() as any);
    const res = await app.request('/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'no name' }),
    });
    expect(res.status).toBe(400);
  });

  test('POST /search returns results', async () => {
    const app = createKnowledgeRoutes(createMockKnowledgeService() as any);
    const body = await json(
      await app.request('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'test' }),
      }),
    );
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('POST /search returns 400 without query', async () => {
    const app = createKnowledgeRoutes(createMockKnowledgeService() as any);
    const res = await app.request('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('DELETE /:docId deletes document', async () => {
    const svc = createMockKnowledgeService();
    const app = createKnowledgeRoutes(svc as any);
    const body = await json(await app.request('/d1', { method: 'DELETE' }));
    expect(body.success).toBe(true);
    expect(svc.deleteDocument).toHaveBeenCalled();
  });

  test('GET /:docId/content returns content', async () => {
    const app = createKnowledgeRoutes(createMockKnowledgeService() as any);
    const body = await json(await app.request('/d1/content'));
    expect(body.success).toBe(true);
    expect(body.data.content).toBe('# Hello');
  });

  test('PUT /ns/:namespace/:docId updates document', async () => {
    const svc = createMockKnowledgeService();
    const app = createKnowledgeRoutes(svc as any);
    const res = await app.request('/ns/notes/d1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '# Updated',
        metadata: { status: 'enhanced' },
      }),
    });
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(svc.updateDocument).toHaveBeenCalledWith(
      expect.any(String),
      'd1',
      { content: '# Updated', metadata: { status: 'enhanced' } },
      'notes',
    );
  });

  test('GET /ns/:namespace/tree returns directory tree', async () => {
    const svc = createMockKnowledgeService();
    const app = createKnowledgeRoutes(svc as any);
    const body = await json(await app.request('/ns/notes/tree'));
    expect(body.success).toBe(true);
    expect(body.data.type).toBe('directory');
    expect(body.data.fileCount).toBe(1);
  });

  test('GET /namespaces returns list', async () => {
    const app = createKnowledgeRoutes(createMockKnowledgeService() as any);
    const body = await json(await app.request('/namespaces'));
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('POST /namespaces creates namespace', async () => {
    const svc = createMockKnowledgeService();
    const app = createKnowledgeRoutes(svc as any);
    const res = await app.request('/namespaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'code', label: 'Code', behavior: 'rag' }),
    });
    expect(res.status).toBe(201);
    expect(svc.registerNamespace).toHaveBeenCalled();
  });

  test('POST /namespaces returns 400 without required fields', async () => {
    const app = createKnowledgeRoutes(createMockKnowledgeService() as any);
    const res = await app.request('/namespaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'bad' }),
    });
    expect(res.status).toBe(400);
  });

  test('DELETE /namespaces/:nsId removes namespace', async () => {
    const svc = createMockKnowledgeService();
    const app = createKnowledgeRoutes(svc as any);
    const body = await json(
      await app.request('/namespaces/code', { method: 'DELETE' }),
    );
    expect(body.success).toBe(true);
  });

  test('namespaced routes work via /ns/:namespace/', async () => {
    const svc = createMockKnowledgeService();
    const app = createKnowledgeRoutes(svc as any);
    const body = await json(await app.request('/ns/code'));
    expect(body.success).toBe(true);
  });
});
