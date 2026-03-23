import type { KnowledgeNamespaceConfig } from '@stallion-ai/shared';
import { Hono } from 'hono';
import type { IStorageAdapter } from '../domain/storage-adapter.js';
import type { KnowledgeService } from '../services/knowledge-service.js';
import type { ProviderService } from '../services/provider-service.js';
import { knowledgeOps } from '../telemetry/metrics.js';

// ── Shared route handlers (used by both default and namespaced routes) ──

function knowledgeHandlers(
  knowledgeService: KnowledgeService,
  getSlug: (c: any) => string,
  getNs: (c: any) => string | undefined,
) {
  const app = new Hono();

  app.get('/', async (c) => {
    try {
      const data = await knowledgeService.listDocuments(getSlug(c), getNs(c));
      return c.json({ success: true, data });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.get('/status', async (c) => {
    try {
      const slug = getSlug(c);
      const ns = getNs(c);
      const docs = await knowledgeService.listDocuments(slug, ns);
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
          namespace: ns ?? 'all',
        },
      });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.post('/upload', async (c) => {
    try {
      const { filename, content, metadata } = await c.req.json();
      if (!filename || !content)
        return c.json(
          { success: false, error: 'filename and content required' },
          400,
        );
      const data = await knowledgeService.uploadDocument(
        getSlug(c),
        filename,
        content,
        'upload',
        getNs(c),
        metadata,
      );
      knowledgeOps.add(1, { op: 'upload' });
      return c.json({ success: true, data }, 201);
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.post('/scan', async (c) => {
    try {
      const { extensions, includePatterns, excludePatterns } = (await c.req
        .json()
        .catch(() => ({}))) as {
        extensions?: string[];
        includePatterns?: string[];
        excludePatterns?: string[];
      };
      const data = await knowledgeService.scanDirectories(
        getSlug(c),
        extensions,
        includePatterns,
        excludePatterns,
        getNs(c) ?? 'code',
      );
      knowledgeOps.add(1, { op: 'scan' });
      return c.json({ success: true, data });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.post('/search', async (c) => {
    try {
      const { query, topK } = await c.req.json();
      if (!query)
        return c.json({ success: false, error: 'query required' }, 400);
      const data = await knowledgeService.searchDocuments(
        getSlug(c),
        query,
        topK,
        getNs(c),
      );
      knowledgeOps.add(1, { op: 'search' });
      return c.json({ success: true, data });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.post('/bulk-delete', async (c) => {
    try {
      const { ids } = (await c.req.json()) as { ids: string[] };
      if (!ids?.length)
        return c.json({ success: false, error: 'ids array required' }, 400);
      const slug = getSlug(c);
      const ns = getNs(c);
      let deleted = 0;
      for (const id of ids) {
        try {
          await knowledgeService.deleteDocument(slug, id, ns);
          deleted++;
        } catch {
          /* skip missing */
        }
      }
      knowledgeOps.add(1, { op: 'bulk_delete' });
      return c.json({ success: true, data: { deleted } });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.get('/:docId/content', async (c) => {
    try {
      const content = await knowledgeService.getDocumentContent(
        getSlug(c),
        c.req.param('docId'),
        getNs(c),
      );
      return c.json({ success: true, data: { content } });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.delete('/:docId', async (c) => {
    try {
      await knowledgeService.deleteDocument(
        getSlug(c),
        c.req.param('docId'),
        getNs(c),
      );
      knowledgeOps.add(1, { op: 'delete' });
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.delete('/', async (c) => {
    try {
      const slug = getSlug(c);
      const ns = getNs(c);
      const docs = await knowledgeService.listDocuments(slug, ns);
      for (const doc of docs) {
        await knowledgeService.deleteDocument(slug, doc.id, ns);
      }
      return c.json({ success: true, data: { deleted: docs.length } });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  return app;
}

// ── Per-project knowledge routes (mounted at /api/projects/:slug/knowledge) ──

export function createKnowledgeRoutes(knowledgeService: KnowledgeService) {
  const app = new Hono<{ Variables: { slug: string } }>();

  app.use('*', async (c, next) => {
    c.set('slug', c.req.param('slug') ?? '');
    await next();
  });

  // Namespace CRUD
  app.get('/namespaces', (c) => {
    try {
      const data = knowledgeService.listNamespaces(c.get('slug'));
      return c.json({ success: true, data });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.post('/namespaces', async (c) => {
    try {
      const body = (await c.req.json()) as KnowledgeNamespaceConfig;
      if (!body.id || !body.label || !body.behavior) {
        return c.json(
          { success: false, error: 'id, label, and behavior required' },
          400,
        );
      }
      knowledgeService.registerNamespace(c.get('slug'), body);
      return c.json({ success: true }, 201);
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.delete('/namespaces/:nsId', (c) => {
    try {
      knowledgeService.removeNamespace(c.get('slug'), c.req.param('nsId'));
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.put('/namespaces/:nsId', async (c) => {
    try {
      const body = await c.req.json();
      knowledgeService.updateNamespace(
        c.get('slug'),
        c.req.param('nsId'),
        body,
      );
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // Namespaced document routes: /ns/:namespace/*
  app.route(
    '/ns/:namespace',
    knowledgeHandlers(
      knowledgeService,
      (c) => c.get('slug') ?? c.req.param('slug'),
      (c) => c.req.param('namespace'),
    ),
  );

  // Default (backward-compat) document routes — no namespace = 'default'
  app.route(
    '/',
    knowledgeHandlers(
      knowledgeService,
      (c) => c.get('slug') ?? c.req.param('slug'),
      () => undefined,
    ),
  );

  return app;
}

// ── Cross-project knowledge routes (mounted at /api/knowledge) ──

export function createCrossProjectKnowledgeRoutes(
  knowledgeService: KnowledgeService,
  storageAdapter: IStorageAdapter,
  providerService: ProviderService,
) {
  const app = new Hono();

  app.get('/status', async (c) => {
    try {
      const connections = providerService.listProviderConnections();
      const vectorDbConn =
        connections.find(
          (c) => c.enabled && c.capabilities.includes('vectordb'),
        ) ?? null;
      const embeddingConn =
        connections.find(
          (c) => c.enabled && c.capabilities.includes('embedding'),
        ) ?? null;

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
          vectorDb: vectorDbConn
            ? {
                id: vectorDbConn.id,
                name: vectorDbConn.name,
                type: vectorDbConn.type,
                enabled: vectorDbConn.enabled,
              }
            : null,
          embedding: embeddingConn
            ? {
                id: embeddingConn.id,
                name: embeddingConn.name,
                type: embeddingConn.type,
                enabled: embeddingConn.enabled,
              }
            : null,
          stats: { totalDocuments, totalChunks, projectCount: projects.length },
        },
      });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.post('/search', async (c) => {
    try {
      const { query, topK = 5, namespace } = await c.req.json();
      if (!query)
        return c.json({ success: false, error: 'query required' }, 400);

      const projects = storageAdapter.listProjects();
      const allResults: Array<{ projectSlug: string; results: any[] }> = [];

      for (const project of projects) {
        const results = await knowledgeService.searchDocuments(
          project.slug,
          query,
          topK,
          namespace,
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
