import { join } from 'node:path';
import {
  KnowledgeDocumentMeta,
  KnowledgeNamespaceConfig,
  KnowledgeSearchFilter,
  KnowledgeTreeNode,
} from '@stallion-ai/contracts/knowledge';
import type { IStorageAdapter } from '../domain/storage-adapter.js';
import type {
  IEmbeddingProvider,
  IVectorDbProvider,
} from '../providers/model-provider-types.js';
import { knowledgeOps } from '../telemetry/metrics.js';
import {
  chunkKnowledgeText,
  DEFAULT_KNOWLEDGE_NAMESPACE,
  deleteKnowledgeFile,
  knowledgeVectorNamespace,
  loadKnowledgeMeta,
  parseKnowledgeFrontmatter,
  readKnowledgeFile,
  saveKnowledgeMeta,
  serializeKnowledgeFrontmatter,
  writeKnowledgeFile,
} from './knowledge-storage.js';
import {
  buildKnowledgeInjectContext,
  buildKnowledgeRagContext,
  findKnowledgeDocumentNamespace,
} from './knowledge-context.js';
import {
  getKnowledgeNamespaceConfig,
  listKnowledgeNamespaces,
  registerKnowledgeNamespace,
  removeKnowledgeNamespace,
  resolveKnowledgeStorageDir,
  updateKnowledgeNamespace,
} from './knowledge-namespaces.js';
import {
  buildKnowledgeDirectoryTree,
  listKnowledgeDocuments,
  scanKnowledgeDirectories,
} from './knowledge-filesystem.js';
import { searchKnowledgeDocuments } from './knowledge-search.js';

/** @deprecated Use KnowledgeDocumentMeta from contracts. Kept for backward compat. */
export type DocumentMeta = KnowledgeDocumentMeta;

const DEFAULT_NS = DEFAULT_KNOWLEDGE_NAMESPACE;

// ── Service ────────────────────────────────────────────────────────

export class KnowledgeService {
  constructor(
    private resolveVectorDb: () => IVectorDbProvider | null,
    private resolveEmbedding: () => IEmbeddingProvider | null,
    private dataDir: string,
    private storageAdapter?: IStorageAdapter,
  ) {}

  // ── Storage resolution ──

  private resolveStorageDir(projectSlug: string, namespace: string): string {
    return resolveKnowledgeStorageDir(
      projectSlug,
      namespace,
      this.dataDir,
      this.storageAdapter,
    );
  }

  private getNamespaceConfig(
    projectSlug: string,
    namespace: string,
  ) {
    return getKnowledgeNamespaceConfig(
      projectSlug,
      namespace,
      this.storageAdapter,
    );
  }

  // ── Namespace management ──

  listNamespaces(projectSlug: string): KnowledgeNamespaceConfig[] {
    return listKnowledgeNamespaces(projectSlug, this.storageAdapter);
  }

  registerNamespace(projectSlug: string, ns: KnowledgeNamespaceConfig): void {
    registerKnowledgeNamespace(projectSlug, ns, this.storageAdapter);
  }

  removeNamespace(projectSlug: string, namespaceId: string): void {
    removeKnowledgeNamespace(projectSlug, namespaceId, this.storageAdapter);
  }

  updateNamespace(
    projectSlug: string,
    namespaceId: string,
    updates: Partial<KnowledgeNamespaceConfig>,
  ): void {
    updateKnowledgeNamespace(
      projectSlug,
      namespaceId,
      updates,
      this.storageAdapter,
    );
  }

  // ── Document CRUD ──

  async uploadDocument(
    projectSlug: string,
    filename: string,
    content: string,
    source: 'upload' | 'directory-scan' | 'sync' = 'upload',
    namespace: string = DEFAULT_NS,
    extraMeta?: Record<string, any>,
  ): Promise<KnowledgeDocumentMeta> {
    const vectorDb = this.resolveVectorDb();
    if (!vectorDb) throw new Error('No vector DB provider configured');
    const ns = knowledgeVectorNamespace(projectSlug, namespace);
    if (!(await vectorDb.namespaceExists(ns))) {
      await vectorDb.createNamespace(ns);
    }

    const nsCfg = this.getNamespaceConfig(projectSlug, namespace);
    const storageDir = this.resolveStorageDir(projectSlug, namespace);
    // Default writeFiles=true for new namespaces (unless explicitly false)
    const shouldWriteFiles = nsCfg?.writeFiles !== false;

    // Parse frontmatter — chunk body only
    const { metadata: fmMeta, body } = parseKnowledgeFrontmatter(content);

    // File-first: write to disk BEFORE indexing
    const filePath = filename;
    if (shouldWriteFiles) {
      writeKnowledgeFile(storageDir, filePath, content);
    }

    // Chunk the body (not frontmatter)
    const chunks = chunkKnowledgeText(body);
    const docId = crypto.randomUUID();

    const embeddingProvider = this.resolveEmbedding();
    let vectors: number[][];
    if (embeddingProvider && chunks.length > 0) {
      vectors = await embeddingProvider.embed(chunks);
    } else {
      vectors = chunks.map(() => []);
    }

    const docs = chunks.map((text, i) => ({
      id: `${docId}:${i}`,
      vector: vectors[i],
      text,
      metadata: { docId, filename, namespace, chunkIndex: i },
    }));

    await vectorDb.addDocuments(ns, docs);

    const mergedMeta = { ...fmMeta, ...extraMeta };
    const meta: KnowledgeDocumentMeta = {
      id: docId,
      filename,
      namespace,
      path: filePath,
      source,
      chunkCount: chunks.length,
      createdAt: new Date().toISOString(),
      ...(shouldWriteFiles && {
        storagePath: join(storageDir, 'files', filePath),
      }),
      ...(Object.keys(mergedMeta).length > 0 && { metadata: mergedMeta }),
    };
    const existing = loadKnowledgeMeta(
      storageDir,
      this.dataDir,
      projectSlug,
      namespace,
    );
    saveKnowledgeMeta(storageDir, [...existing, meta]);
    knowledgeOps.add(1, { op: 'index' });
    return meta;
  }

  async searchDocuments(
    projectSlug: string,
    query: string,
    topK = 5,
    namespace?: string,
  ) {
    const allResults = await searchKnowledgeDocuments({
      projectSlug,
      query,
      topK,
      namespace,
      vectorDb: this.resolveVectorDb(),
      embeddingProvider: this.resolveEmbedding(),
      listNamespaces: (slug) => this.listNamespaces(slug),
    });
    knowledgeOps.add(1, { op: 'query' });
    return allResults;
  }

  async listDocuments(
    projectSlug: string,
    namespace?: string,
    filter?: KnowledgeSearchFilter,
  ): Promise<KnowledgeDocumentMeta[]> {
    return listKnowledgeDocuments({
      projectSlug,
      namespace,
      filter,
      dataDir: this.dataDir,
      listNamespaces: (slug) => this.listNamespaces(slug),
      resolveStorageDir: (slug, targetNamespace) =>
        this.resolveStorageDir(slug, targetNamespace),
    });
  }

  async deleteDocument(
    projectSlug: string,
    docId: string,
    namespace?: string,
  ): Promise<void> {
    const vectorDb = this.resolveVectorDb();
    if (!vectorDb) throw new Error('No vector DB provider configured');

    const targetNs = namespace ?? this.findDocNamespace(projectSlug, docId);
    if (!targetNs) throw new Error(`Document '${docId}' not found`);

    const ns = knowledgeVectorNamespace(projectSlug, targetNs);
    const storageDir = this.resolveStorageDir(projectSlug, targetNs);
    const meta = loadKnowledgeMeta(
      storageDir,
      this.dataDir,
      projectSlug,
      targetNs,
    );
    const doc = meta.find((d) => d.id === docId);
    if (!doc)
      throw new Error(
        `Document '${docId}' not found in namespace '${targetNs}'`,
      );

    // File-first: delete from disk
    const filePath = doc.path || doc.filename;
    deleteKnowledgeFile(storageDir, filePath);

    // Then remove from vector index
    const chunkIds = Array.from(
      { length: doc.chunkCount },
      (_, i) => `${docId}:${i}`,
    );
    await vectorDb.deleteDocuments(ns, chunkIds);

    saveKnowledgeMeta(
      storageDir,
      meta.filter((d) => d.id !== docId),
    );
    knowledgeOps.add(1, { op: 'delete' });
  }

  // ── Document content retrieval ──

  async getDocumentContent(
    projectSlug: string,
    docId: string,
    namespace?: string,
  ): Promise<string> {
    const targetNs = namespace ?? this.findDocNamespace(projectSlug, docId);
    if (!targetNs) throw new Error(`Document '${docId}' not found`);

    const storageDir = this.resolveStorageDir(projectSlug, targetNs);
    const meta = loadKnowledgeMeta(
      storageDir,
      this.dataDir,
      projectSlug,
      targetNs,
    );
    const doc = meta.find((d) => d.id === docId);
    if (!doc) throw new Error(`Document '${docId}' not found`);

    // File-first: try reading from disk
    const filePath = doc.path || doc.filename;
    const fileContent = readKnowledgeFile(storageDir, filePath);
    if (fileContent !== null) return fileContent;

    // Fallback: reconstruct from vector chunks (backward compat)
    const vectorDb = this.resolveVectorDb();
    if (!vectorDb) throw new Error('No vector DB provider configured');

    const ns = knowledgeVectorNamespace(projectSlug, targetNs);
    if (!(await vectorDb.namespaceExists(ns)))
      throw new Error('Vector namespace not found');

    const results = await vectorDb.getByMetadata(ns, 'docId', docId);
    const chunks = new Map<number, string>();
    for (const r of results) {
      chunks.set(r.metadata.chunkIndex as number, r.text);
    }
    const sorted = Array.from(chunks.entries()).sort((a, b) => a[0] - b[0]);
    return sorted.map(([, text]) => text).join('\n\n');
  }

  // ── Update document in-place ──

  async updateDocument(
    projectSlug: string,
    docId: string,
    updates: { content?: string; metadata?: Record<string, any> },
    namespace?: string,
  ): Promise<KnowledgeDocumentMeta> {
    const vectorDb = this.resolveVectorDb();
    if (!vectorDb) throw new Error('No vector DB provider configured');

    const targetNs = namespace ?? this.findDocNamespace(projectSlug, docId);
    if (!targetNs) throw new Error(`Document '${docId}' not found`);

    const storageDir = this.resolveStorageDir(projectSlug, targetNs);
    const allMeta = loadKnowledgeMeta(
      storageDir,
      this.dataDir,
      projectSlug,
      targetNs,
    );
    const docIdx = allMeta.findIndex((d) => d.id === docId);
    if (docIdx < 0) throw new Error(`Document '${docId}' not found`);
    const doc = allMeta[docIdx];

    const filePath = doc.path || doc.filename;
    let content = updates.content;
    let newMetadata = { ...doc.metadata, ...updates.metadata };

    if (content === undefined) {
      // Read existing content to re-index
      const existing = readKnowledgeFile(storageDir, filePath);
      if (existing) {
        const { metadata: fmMeta, body } = parseKnowledgeFrontmatter(existing);
        newMetadata = { ...fmMeta, ...doc.metadata, ...updates.metadata };
        content = body;
      }
    } else {
      const { metadata: fmMeta, body } = parseKnowledgeFrontmatter(content);
      newMetadata = { ...fmMeta, ...updates.metadata };
      content = body;
    }

    // Write updated file to disk
    const nsCfg = this.getNamespaceConfig(projectSlug, targetNs);
    if (nsCfg?.writeFiles !== false) {
      const fileContent = serializeKnowledgeFrontmatter(
        newMetadata,
        content ?? '',
      );
      writeKnowledgeFile(storageDir, filePath, fileContent);
    }

    // Re-index: delete old chunks, embed new
    const ns = knowledgeVectorNamespace(projectSlug, targetNs);
    const oldChunkIds = Array.from(
      { length: doc.chunkCount },
      (_, i) => `${docId}:${i}`,
    );
    await vectorDb.deleteDocuments(ns, oldChunkIds);

    const chunks = chunkKnowledgeText(content ?? '');
    const embeddingProvider = this.resolveEmbedding();
    let vectors: number[][];
    if (embeddingProvider && chunks.length > 0) {
      vectors = await embeddingProvider.embed(chunks);
    } else {
      vectors = chunks.map(() => []);
    }

    const newDocs = chunks.map((text, i) => ({
      id: `${docId}:${i}`,
      vector: vectors[i],
      text,
      metadata: {
        docId,
        filename: doc.filename,
        namespace: targetNs,
        chunkIndex: i,
      },
    }));
    if (newDocs.length > 0) await vectorDb.addDocuments(ns, newDocs);

    // Update metadata — preserve ID
    const updatedMeta: KnowledgeDocumentMeta = {
      ...doc,
      chunkCount: chunks.length,
      updatedAt: new Date().toISOString(),
      ...(Object.keys(newMetadata).length > 0 && { metadata: newMetadata }),
    };
    allMeta[docIdx] = updatedMeta;
    saveKnowledgeMeta(storageDir, allMeta);
    knowledgeOps.add(1, { op: 'update' });
    return updatedMeta;
  }

  // ── Directory tree ──

  getDirectoryTree(projectSlug: string, namespace: string): KnowledgeTreeNode {
    return buildKnowledgeDirectoryTree({
      projectSlug,
      namespace,
      dataDir: this.dataDir,
      resolveStorageDir: (slug, targetNamespace) =>
        this.resolveStorageDir(slug, targetNamespace),
    });
  }

  // ── Context injection ──

  /**
   * RAG context — searches rag-behavior namespaces for relevant content.
   */
  async getRAGContext(
    projectSlug: string,
    userMessage: string,
    topK = 4,
    threshold = 0.25,
  ): Promise<string | null> {
    const results = await this.searchDocuments(projectSlug, userMessage, topK);
    return buildKnowledgeRagContext(results, threshold);
  }

  /**
   * Inject context — concatenates ALL content from inject-behavior namespaces.
   * Returns formatted string for system prompt prepending, or null if empty.
   */
  async getInjectContext(projectSlug: string): Promise<string | null> {
    const namespaces = this.listNamespaces(projectSlug).filter(
      (n) => n.behavior === 'inject',
    );
    if (namespaces.length === 0) return null;

    const vectorDb = this.resolveVectorDb();
    if (!vectorDb) return null;
    const embeddingProvider = this.resolveEmbedding();
    if (!embeddingProvider) return null;

    return buildKnowledgeInjectContext({
      projectSlug,
      namespaces,
      dataDir: this.dataDir,
      resolveStorageDir: (slug, namespace) => this.resolveStorageDir(slug, namespace),
      vectorDb,
      embeddingProvider,
    });
  }

  // ── Directory scanning ──

  async scanDirectories(
    projectSlug: string,
    extensions?: string[],
    includePatterns?: string[],
    excludePatterns?: string[],
    namespace: string = 'code',
  ): Promise<{ indexed: number; skipped: number }> {
    return scanKnowledgeDirectories({
      projectSlug,
      namespace,
      extensions,
      includePatterns,
      excludePatterns,
      storageAdapter: this.storageAdapter,
      getNamespaceConfig: (slug, targetNamespace) =>
        this.getNamespaceConfig(slug, targetNamespace),
      uploadDocument: async (
        slug,
        filename,
        content,
        source,
        targetNamespace,
      ) =>
        this.uploadDocument(
          slug,
          filename,
          content,
          source,
          targetNamespace,
        ),
    });
  }

  // ── Private helpers ──

  private findDocNamespace(projectSlug: string, docId: string): string | null {
    return findKnowledgeDocumentNamespace({
      projectSlug,
      docId,
      namespaces: this.listNamespaces(projectSlug),
      dataDir: this.dataDir,
      resolveStorageDir: (slug, namespace) => this.resolveStorageDir(slug, namespace),
    });
  }
}
