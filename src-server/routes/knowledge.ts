import { Hono } from 'hono';
import type { IStorageAdapter } from '../domain/storage-adapter.js';
import type { KnowledgeService } from '../services/knowledge-service.js';
import type { ProviderService } from '../services/provider-service.js';

export function createKnowledgeRoutes(knowledgeService: KnowledgeService) {
  const app = new Hono<{ Variables: { slug: string } }>();

  app.use('*', async (c, next) => {
    c.set('slug', c.req.param('slug') ?? '');
    await next();
  });

  // List documents
  app.get('/', async (c) => {
    try {
      const data = await knowledgeService.listDocuments(c.get('slug'));
      return c.json({ success: true, data });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // Status — summary stats for the knowledge base
  app.get('/status', async (c) => {
    try {
      const slug = c.get('slug');
      const docs = await knowledgeService.listDocuments(slug);
      const totalChunks = docs.reduce((sum, d) => sum + d.chunkCount, 0);
      const lastIndexed =
        docs.length > 0
          ? docs.reduce(
              (latest, d) => (d.createdAt > latest ? d.createdAt : latest),
              docs[0].createdAt,
            )
          : null;
      return c.json({
        success: true,
        data: {
          provider: 'LanceDB (file-based)',
          documentCount: docs.length,
          totalChunks,
          lastIndexed,
        },
      });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // Upload document (text content)
  app.post('/upload', async (c) => {
    try {
      const { filename, content } = await c.req.json();
      if (!filename || !content)
        return c.json(
          { success: false, error: 'filename and content required' },
          400,
        );
      const data = await knowledgeService.uploadDocument(
        c.get('slug'),
        filename,
        content,
      );
      return c.json({ success: true, data }, 201);
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // Scan project directories and index files
  app.post('/scan', async (c) => {
    try {
      const { extensions, includePatterns, excludePatterns } =
        (await c.req.json().catch(() => ({}))) as {
          extensions?: string[];
          includePatterns?: string[];
          excludePatterns?: string[];
        };
      const data = await knowledgeService.scanDirectories(
        c.get('slug'),
        extensions,
        includePatterns,
        excludePatterns,
      );
      return c.json({ success: true, data });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // Search within project knowledge
  app.post('/search', async (c) => {
    try {
      const { query, topK } = await c.req.json();
      if (!query)
        return c.json({ success: false, error: 'query required' }, 400);
      const data = await knowledgeService.searchDocuments(
        c.get('slug'),
        query,
        topK,
      );
      return c.json({ success: true, data });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // Bulk delete documents
  app.post('/bulk-delete', async (c) => {
    try {
      const { ids } = (await c.req.json()) as { ids: string[] };
      if (!ids?.length)
        return c.json({ success: false, error: 'ids array required' }, 400);
      const slug = c.get('slug');
      let deleted = 0;
      for (const id of ids) {
        try {
          await knowledgeService.deleteDocument(slug, id);
          deleted++;
        } catch {
          /* skip missing */
        }
      }
      return c.json({ success: true, data: { deleted } });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // Delete document
  app.delete('/:docId', async (c) => {
    try {
      await knowledgeService.deleteDocument(
        c.get('slug'),
        c.req.param('docId'),
      );
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // Clear all documents
  app.delete('/', async (c) => {
    try {
      const docs = await knowledgeService.listDocuments(c.get('slug'));
      for (const doc of docs) {
        await knowledgeService.deleteDocument(c.get('slug'), doc.id);
      }
      return c.json({ success: true, data: { deleted: docs.length } });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  return app;
}

export function createCrossProjectKnowledgeRoutes(
  knowledgeService: KnowledgeService,
  storageAdapter: IStorageAdapter,
  providerService: ProviderService,
) {
  const app = new Hono();

  app.get('/status', async (c) => {
    try {
      const connections = providerService.listProviderConnections();
      const vectorDbConn = connections.find(c => c.enabled && c.capabilities.includes('vectordb')) ?? null;
      const embeddingConn = connections.find(c => c.enabled && c.capabilities.includes('embedding')) ?? null;

      const projects = storageAdapter.listProjects();
      let totalDocuments = 0;
      let totalChunks = 0;
      for (const project of projects) {
        const docs = await knowledgeService.listDocuments(project.slug);
        totalDocuments += docs.length;
        totalChunks += docs.reduce((sum, d) => sum + d.chunkCount, 0);
      }

      return c.json({
        success: true,
        data: {
          vectorDb: vectorDbConn ? { id: vectorDbConn.id, name: vectorDbConn.name, type: vectorDbConn.type, enabled: vectorDbConn.enabled } : null,
          embedding: embeddingConn ? { id: embeddingConn.id, name: embeddingConn.name, type: embeddingConn.type, enabled: embeddingConn.enabled } : null,
          stats: { totalDocuments, totalChunks, projectCount: projects.length },
        },
      });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.post('/search', async (c) => {
    try {
      const { query, topK = 5 } = await c.req.json();
      if (!query)
        return c.json({ success: false, error: 'query required' }, 400);

      const projects = storageAdapter.listProjects();
      const allResults: Array<{ projectSlug: string; results: any[] }> = [];

      for (const project of projects) {
        const results = await knowledgeService.searchDocuments(
          project.slug,
          query,
          topK,
        );
        if (results.length > 0) {
          allResults.push({ projectSlug: project.slug, results });
        }
      }

      return c.json({ success: true, data: allResults });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  return app;
}
