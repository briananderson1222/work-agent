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
  DEFAULT_KNOWLEDGE_NAMESPACE,
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
import {
  deleteKnowledgeDocument,
  getKnowledgeDocumentContent,
  updateKnowledgeDocument,
  uploadKnowledgeDocument,
} from './knowledge-documents.js';
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
    const meta = await uploadKnowledgeDocument(
      {
        vectorDb: this.resolveVectorDb(),
        embeddingProvider: this.resolveEmbedding(),
        dataDir: this.dataDir,
        resolveStorageDir: (slug, targetNamespace) =>
          this.resolveStorageDir(slug, targetNamespace),
        getNamespaceConfig: (slug, targetNamespace) =>
          this.getNamespaceConfig(slug, targetNamespace),
        findDocNamespace: (slug, docId) => this.findDocNamespace(slug, docId),
      },
      projectSlug,
      filename,
      content,
      source,
      namespace,
      extraMeta,
    );
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
    await deleteKnowledgeDocument(
      {
        vectorDb: this.resolveVectorDb(),
        embeddingProvider: this.resolveEmbedding(),
        dataDir: this.dataDir,
        resolveStorageDir: (slug, targetNamespace) =>
          this.resolveStorageDir(slug, targetNamespace),
        getNamespaceConfig: (slug, targetNamespace) =>
          this.getNamespaceConfig(slug, targetNamespace),
        findDocNamespace: (slug, targetDocId) =>
          this.findDocNamespace(slug, targetDocId),
      },
      projectSlug,
      docId,
      namespace,
    );
    knowledgeOps.add(1, { op: 'delete' });
  }

  // ── Document content retrieval ──

  async getDocumentContent(
    projectSlug: string,
    docId: string,
    namespace?: string,
  ): Promise<string> {
    return getKnowledgeDocumentContent(
      {
        vectorDb: this.resolveVectorDb(),
        embeddingProvider: this.resolveEmbedding(),
        dataDir: this.dataDir,
        resolveStorageDir: (slug, targetNamespace) =>
          this.resolveStorageDir(slug, targetNamespace),
        getNamespaceConfig: (slug, targetNamespace) =>
          this.getNamespaceConfig(slug, targetNamespace),
        findDocNamespace: (slug, targetDocId) =>
          this.findDocNamespace(slug, targetDocId),
      },
      projectSlug,
      docId,
      namespace,
    );
  }

  // ── Update document in-place ──

  async updateDocument(
    projectSlug: string,
    docId: string,
    updates: { content?: string; metadata?: Record<string, any> },
    namespace?: string,
  ): Promise<KnowledgeDocumentMeta> {
    const updatedMeta = await updateKnowledgeDocument(
      {
        vectorDb: this.resolveVectorDb(),
        embeddingProvider: this.resolveEmbedding(),
        dataDir: this.dataDir,
        resolveStorageDir: (slug, targetNamespace) =>
          this.resolveStorageDir(slug, targetNamespace),
        getNamespaceConfig: (slug, targetNamespace) =>
          this.getNamespaceConfig(slug, targetNamespace),
        findDocNamespace: (slug, targetDocId) =>
          this.findDocNamespace(slug, targetDocId),
      },
      projectSlug,
      docId,
      updates,
      namespace,
    );
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
