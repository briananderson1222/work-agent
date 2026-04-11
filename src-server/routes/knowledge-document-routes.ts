import type { Context } from 'hono';
import { Hono } from 'hono';
import type { KnowledgeService } from '../services/knowledge-service.js';
import { knowledgeOps } from '../telemetry/metrics.js';
import {
  errorMessage,
  getBody,
  knowledgeBulkDeleteSchema,
  knowledgeSearchSchema,
  knowledgeUpdateSchema,
  knowledgeUploadSchema,
  param,
  validate,
} from './schemas.js';

function buildKnowledgeFilter(url: URL) {
  const tags = url.searchParams.get('tags');
  const after = url.searchParams.get('after');
  const before = url.searchParams.get('before');
  const pathPrefix = url.searchParams.get('pathPrefix');
  const status = url.searchParams.get('status');

  const metadataFilter: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith('metadata.')) {
      metadataFilter[key.slice(9)] = value;
    }
  }

  const hasFilter =
    tags ||
    after ||
    before ||
    pathPrefix ||
    status ||
    Object.keys(metadataFilter).length > 0;
  if (!hasFilter) {
    return undefined;
  }

  return {
    ...(tags && { tags: tags.split(',') }),
    ...(after && { after }),
    ...(before && { before }),
    ...(pathPrefix && { pathPrefix }),
    ...(status && { status }),
    ...(Object.keys(metadataFilter).length > 0 && { metadata: metadataFilter }),
  };
}

export function createKnowledgeDocumentRoutes(
  knowledgeService: KnowledgeService,
  getSlug: (c: Context) => string,
  getNamespace: (c: Context) => string | undefined,
) {
  const app = new Hono();

  app.get('/', async (c) => {
    try {
      const data = await knowledgeService.listDocuments(
        getSlug(c),
        getNamespace(c),
        buildKnowledgeFilter(new URL(c.req.url)),
      );
      return c.json({ success: true, data });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.get('/status', async (c) => {
    try {
      const slug = getSlug(c);
      const namespace = getNamespace(c);
      const docs = await knowledgeService.listDocuments(slug, namespace);
      const totalChunks = docs.reduce((sum, doc) => sum + doc.chunkCount, 0);
      const lastIndexed =
        docs.length > 0
          ? docs.reduce(
              (latest, doc) =>
                doc.createdAt > latest ? doc.createdAt : latest,
              docs[0].createdAt,
            )
          : null;
      return c.json({
        success: true,
        data: {
          provider: 'Built-in Vector Store',
          documentCount: docs.length,
          totalChunks,
          lastIndexed,
          namespace: namespace ?? 'all',
        },
      });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.post('/upload', validate(knowledgeUploadSchema), async (c) => {
    try {
      const { filename, content, metadata } = getBody(c);
      const data = await knowledgeService.uploadDocument(
        getSlug(c),
        filename,
        content,
        'upload',
        getNamespace(c),
        metadata,
      );
      knowledgeOps.add(1, { op: 'upload' });
      return c.json({ success: true, data }, 201);
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
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
        getNamespace(c) ?? 'code',
      );
      knowledgeOps.add(1, { op: 'scan' });
      return c.json({ success: true, data });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.post('/search', validate(knowledgeSearchSchema), async (c) => {
    try {
      const { query, topK } = getBody(c);
      const data = await knowledgeService.searchDocuments(
        getSlug(c),
        query,
        topK,
        getNamespace(c),
      );
      knowledgeOps.add(1, { op: 'search' });
      return c.json({ success: true, data });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.post('/bulk-delete', validate(knowledgeBulkDeleteSchema), async (c) => {
    try {
      const { ids } = getBody(c);
      const slug = getSlug(c);
      const namespace = getNamespace(c);
      let deleted = 0;
      for (const id of ids) {
        try {
          await knowledgeService.deleteDocument(slug, id, namespace);
          deleted++;
        } catch {
          // Ignore missing documents during bulk deletes.
        }
      }
      knowledgeOps.add(1, { op: 'bulk_delete' });
      return c.json({ success: true, data: { deleted } });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.get('/:docId/content', async (c) => {
    try {
      const content = await knowledgeService.getDocumentContent(
        getSlug(c),
        param(c, 'docId'),
        getNamespace(c),
      );
      return c.json({ success: true, data: { content } });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.get('/tree', (c) => {
    try {
      const namespace = getNamespace(c);
      if (!namespace) {
        return c.json(
          { success: false, error: 'Namespace required for tree' },
          400,
        );
      }
      const data = knowledgeService.getDirectoryTree(getSlug(c), namespace);
      return c.json({ success: true, data });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.put('/:docId', validate(knowledgeUpdateSchema), async (c) => {
    try {
      const { content, metadata } = getBody(c);
      const data = await knowledgeService.updateDocument(
        getSlug(c),
        param(c, 'docId'),
        { content, metadata },
        getNamespace(c),
      );
      return c.json({ success: true, data });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.delete('/:docId', async (c) => {
    try {
      await knowledgeService.deleteDocument(
        getSlug(c),
        param(c, 'docId'),
        getNamespace(c),
      );
      knowledgeOps.add(1, { op: 'delete' });
      return c.json({ success: true });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.delete('/', async (c) => {
    try {
      const slug = getSlug(c);
      const namespace = getNamespace(c);
      const docs = await knowledgeService.listDocuments(slug, namespace);
      for (const doc of docs) {
        await knowledgeService.deleteDocument(slug, doc.id, namespace);
      }
      return c.json({ success: true, data: { deleted: docs.length } });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  return app;
}
