import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, relative } from 'node:path';
import type {
  KnowledgeDocumentMeta,
  KnowledgeNamespaceConfig,
} from '@stallion-ai/shared';
import { BUILTIN_KNOWLEDGE_NAMESPACES } from '@stallion-ai/shared';
import type { IStorageAdapter } from '../domain/storage-adapter.js';
import type {
  IEmbeddingProvider,
  IVectorDbProvider,
} from '../providers/types.js';
import { knowledgeOps } from '../telemetry/metrics.js';

/** @deprecated Use KnowledgeDocumentMeta from shared. Kept for backward compat. */
export type DocumentMeta = KnowledgeDocumentMeta;

const DEFAULT_NS = 'default';

const DEFAULT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.mdx',
  '.json',
  '.csv',
  '.html',
  '.htm',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.sql',
  '.sh',
  '.bash',
  '.css',
  '.scss',
  '.less',
  '.svelte',
  '.vue',
]);

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.cache',
  '__pycache__',
  'target',
  '.next',
]);

function chunkText(text: string, maxChunkSize = 500): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (current.length + trimmed.length + 2 <= maxChunkSize) {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    } else {
      if (current) chunks.push(current);
      if (trimmed.length <= maxChunkSize) {
        current = trimmed;
      } else {
        for (const line of trimmed.split(/\n/)) {
          const l = line.trim();
          if (!l) continue;
          if (current.length + l.length + 1 <= maxChunkSize) {
            current = current ? `${current}\n${l}` : l;
          } else {
            if (current) chunks.push(current);
            current = l;
          }
        }
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// ── Namespace-aware storage helpers ────────────────────────────────

/** Default storage dir for a namespace (new layout: knowledge/<ns>/) */
function defaultStorageDir(
  dataDir: string,
  projectSlug: string,
  namespace: string,
): string {
  return join(dataDir, 'projects', projectSlug, 'knowledge', namespace);
}

/** Old metadata path (pre-directory-per-namespace). Used for migration. */
function legacyMetaFile(
  dataDir: string,
  projectSlug: string,
  namespace: string,
): string {
  return join(
    dataDir,
    'projects',
    projectSlug,
    'documents',
    `metadata-${namespace}.json`,
  );
}

/** Original flat metadata path (pre-namespace). */
function legacyFlatMetaFile(dataDir: string, projectSlug: string): string {
  return join(dataDir, 'projects', projectSlug, 'documents', 'metadata.json');
}

function loadMeta(
  storageDir: string,
  dataDir: string,
  projectSlug: string,
  namespace: string,
): KnowledgeDocumentMeta[] {
  // 1. New path: <storageDir>/metadata.json
  const newFile = join(storageDir, 'metadata.json');
  if (existsSync(newFile)) {
    return JSON.parse(
      readFileSync(newFile, 'utf-8'),
    ) as KnowledgeDocumentMeta[];
  }
  // 2. Migration: old namespace-aware path
  const oldNsFile = legacyMetaFile(dataDir, projectSlug, namespace);
  if (existsSync(oldNsFile)) {
    const docs = JSON.parse(
      readFileSync(oldNsFile, 'utf-8'),
    ) as KnowledgeDocumentMeta[];
    // Migrate: write to new location
    mkdirSync(storageDir, { recursive: true });
    writeFileSync(newFile, JSON.stringify(docs, null, 2), 'utf-8');
    return docs;
  }
  // 3. Migration: legacy flat file for 'default' namespace
  if (namespace === DEFAULT_NS) {
    const flatFile = legacyFlatMetaFile(dataDir, projectSlug);
    if (existsSync(flatFile)) {
      const docs = JSON.parse(readFileSync(flatFile, 'utf-8')) as any[];
      const migrated = docs.map((d) => ({ ...d, namespace: DEFAULT_NS }));
      mkdirSync(storageDir, { recursive: true });
      writeFileSync(newFile, JSON.stringify(migrated, null, 2), 'utf-8');
      return migrated;
    }
  }
  return [];
}

function saveMeta(storageDir: string, docs: KnowledgeDocumentMeta[]): void {
  mkdirSync(storageDir, { recursive: true });
  writeFileSync(
    join(storageDir, 'metadata.json'),
    JSON.stringify(docs, null, 2),
    'utf-8',
  );
}

function writeFileToDisk(
  storageDir: string,
  filename: string,
  content: string,
): void {
  const filesDir = join(storageDir, 'files');
  mkdirSync(filesDir, { recursive: true });
  writeFileSync(join(filesDir, filename), content, 'utf-8');
}

function deleteFileFromDisk(storageDir: string, filename: string): void {
  const filePath = join(storageDir, 'files', filename);
  try {
    unlinkSync(filePath);
  } catch {
    /* file may not exist */
  }
}

function vectorNs(projectSlug: string, namespace: string): string {
  return namespace === DEFAULT_NS
    ? `project-${projectSlug}`
    : `project-${projectSlug}:${namespace}`;
}

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
    const nsCfg = this.listNamespaces(projectSlug).find(
      (n) => n.id === namespace,
    );
    if (nsCfg?.storageDir) return nsCfg.storageDir;
    return defaultStorageDir(this.dataDir, projectSlug, namespace);
  }

  private getNamespaceConfig(
    projectSlug: string,
    namespace: string,
  ): KnowledgeNamespaceConfig | undefined {
    return this.listNamespaces(projectSlug).find((n) => n.id === namespace);
  }

  // ── Namespace management ──

  listNamespaces(projectSlug: string): KnowledgeNamespaceConfig[] {
    if (!this.storageAdapter) return [...BUILTIN_KNOWLEDGE_NAMESPACES];
    try {
      const project = this.storageAdapter.getProject(projectSlug);
      const custom = project.knowledgeNamespaces ?? [];
      // Merge built-ins with project-specific, dedup by id
      const seen = new Set<string>();
      const result: KnowledgeNamespaceConfig[] = [];
      for (const ns of [...BUILTIN_KNOWLEDGE_NAMESPACES, ...custom]) {
        if (!seen.has(ns.id)) {
          seen.add(ns.id);
          result.push(ns);
        }
      }
      return result;
    } catch {
      return [...BUILTIN_KNOWLEDGE_NAMESPACES];
    }
  }

  registerNamespace(projectSlug: string, ns: KnowledgeNamespaceConfig): void {
    if (!this.storageAdapter) throw new Error('Storage adapter required');
    const project = this.storageAdapter.getProject(projectSlug);
    const existing = project.knowledgeNamespaces ?? [];
    if (existing.some((e) => e.id === ns.id)) return; // already registered
    project.knowledgeNamespaces = [...existing, ns];
    project.updatedAt = new Date().toISOString();
    this.storageAdapter.saveProject(project);
  }

  removeNamespace(projectSlug: string, namespaceId: string): void {
    if (!this.storageAdapter) throw new Error('Storage adapter required');
    if (BUILTIN_KNOWLEDGE_NAMESPACES.some((b) => b.id === namespaceId)) {
      throw new Error(`Cannot remove built-in namespace '${namespaceId}'`);
    }
    const project = this.storageAdapter.getProject(projectSlug);
    project.knowledgeNamespaces = (project.knowledgeNamespaces ?? []).filter(
      (n) => n.id !== namespaceId,
    );
    project.updatedAt = new Date().toISOString();
    this.storageAdapter.saveProject(project);
  }

  updateNamespace(
    projectSlug: string,
    namespaceId: string,
    updates: Partial<KnowledgeNamespaceConfig>,
  ): void {
    if (!this.storageAdapter) throw new Error('Storage adapter required');
    const project = this.storageAdapter.getProject(projectSlug);
    const namespaces = project.knowledgeNamespaces ?? [];
    const idx = namespaces.findIndex((n) => n.id === namespaceId);
    if (idx >= 0) {
      namespaces[idx] = { ...namespaces[idx], ...updates, id: namespaceId };
    } else {
      // Might be a built-in — add as override
      const builtin = BUILTIN_KNOWLEDGE_NAMESPACES.find(
        (b) => b.id === namespaceId,
      );
      if (builtin) namespaces.push({ ...builtin, ...updates, id: namespaceId });
      else throw new Error(`Namespace '${namespaceId}' not found`);
    }
    project.knowledgeNamespaces = namespaces;
    project.updatedAt = new Date().toISOString();
    this.storageAdapter.saveProject(project);
  }

  // ── Document CRUD ──

  async uploadDocument(
    projectSlug: string,
    filename: string,
    content: string,
    source: 'upload' | 'directory-scan' = 'upload',
    namespace: string = DEFAULT_NS,
    extraMeta?: Record<string, any>,
  ): Promise<KnowledgeDocumentMeta> {
    const vectorDb = this.resolveVectorDb();
    if (!vectorDb) throw new Error('No vector DB provider configured');
    const ns = vectorNs(projectSlug, namespace);
    if (!(await vectorDb.namespaceExists(ns))) {
      await vectorDb.createNamespace(ns);
    }

    const chunks = chunkText(content);
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

    // Write file to disk if configured
    const nsCfg = this.getNamespaceConfig(projectSlug, namespace);
    const storageDir = this.resolveStorageDir(projectSlug, namespace);
    if (nsCfg?.writeFiles) {
      writeFileToDisk(storageDir, filename, content);
    }

    const meta: KnowledgeDocumentMeta = {
      id: docId,
      filename,
      namespace,
      source,
      chunkCount: chunks.length,
      createdAt: new Date().toISOString(),
      ...extraMeta,
    };
    const existing = loadMeta(storageDir, this.dataDir, projectSlug, namespace);
    saveMeta(storageDir, [...existing, meta]);
    knowledgeOps.add(1, { op: 'index' });
    return meta;
  }

  async searchDocuments(
    projectSlug: string,
    query: string,
    topK = 5,
    namespace?: string,
  ) {
    const vectorDb = this.resolveVectorDb();
    if (!vectorDb) return [];
    const embeddingProvider = this.resolveEmbedding();
    if (!embeddingProvider) return [];
    const [queryVector] = await embeddingProvider.embed([query]);

    if (namespace) {
      // Search single namespace
      const ns = vectorNs(projectSlug, namespace);
      if (!(await vectorDb.namespaceExists(ns))) return [];
      const results = await vectorDb.search(ns, queryVector, topK);
      knowledgeOps.add(1, { op: 'query' });
      return results;
    }

    // Search all rag-behavior namespaces
    const namespaces = this.listNamespaces(projectSlug).filter(
      (n) => n.behavior === 'rag',
    );
    const allResults: any[] = [];
    for (const nsCfg of namespaces) {
      const ns = vectorNs(projectSlug, nsCfg.id);
      if (!(await vectorDb.namespaceExists(ns))) continue;
      const results = await vectorDb.search(ns, queryVector, topK);
      allResults.push(...results);
    }
    // Sort by score descending, take topK
    allResults.sort((a, b) => b.score - a.score);
    knowledgeOps.add(1, { op: 'query' });
    return allResults.slice(0, topK);
  }

  async listDocuments(
    projectSlug: string,
    namespace?: string,
  ): Promise<KnowledgeDocumentMeta[]> {
    if (namespace) {
      const storageDir = this.resolveStorageDir(projectSlug, namespace);
      return loadMeta(storageDir, this.dataDir, projectSlug, namespace);
    }
    // List across all namespaces
    const namespaces = this.listNamespaces(projectSlug);
    const all: KnowledgeDocumentMeta[] = [];
    for (const ns of namespaces) {
      const storageDir = this.resolveStorageDir(projectSlug, ns.id);
      all.push(...loadMeta(storageDir, this.dataDir, projectSlug, ns.id));
    }
    return all;
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

    const ns = vectorNs(projectSlug, targetNs);
    const storageDir = this.resolveStorageDir(projectSlug, targetNs);
    const meta = loadMeta(storageDir, this.dataDir, projectSlug, targetNs);
    const doc = meta.find((d) => d.id === docId);
    if (!doc)
      throw new Error(
        `Document '${docId}' not found in namespace '${targetNs}'`,
      );

    const chunkIds = Array.from(
      { length: doc.chunkCount },
      (_, i) => `${docId}:${i}`,
    );
    await vectorDb.deleteDocuments(ns, chunkIds);

    // Delete file from disk if writeFiles is enabled
    const nsCfg = this.getNamespaceConfig(projectSlug, targetNs);
    if (nsCfg?.writeFiles) {
      deleteFileFromDisk(storageDir, doc.filename);
    }

    saveMeta(
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
    const vectorDb = this.resolveVectorDb();
    if (!vectorDb) throw new Error('No vector DB provider configured');

    const targetNs = namespace ?? this.findDocNamespace(projectSlug, docId);
    if (!targetNs) throw new Error(`Document '${docId}' not found`);

    const storageDir = this.resolveStorageDir(projectSlug, targetNs);
    const meta = loadMeta(storageDir, this.dataDir, projectSlug, targetNs);
    const doc = meta.find((d) => d.id === docId);
    if (!doc) throw new Error(`Document '${docId}' not found`);

    const ns = vectorNs(projectSlug, targetNs);
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
    const relevant = results.filter((r) => r.score >= threshold);
    if (relevant.length === 0) return null;

    const contextBlocks = relevant.map(
      (r, i) =>
        `[${i + 1}] (score: ${r.score.toFixed(2)}, source: ${r.metadata.filename ?? 'unknown'})\n${r.text}`,
    );

    return `<project_knowledge>\nThe following context was retrieved from the project's knowledge base. Use it to inform your response when relevant.\n\n${contextBlocks.join('\n\n')}\n</project_knowledge>`;
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

    const sections: string[] = [];
    for (const nsCfg of namespaces) {
      const storageDir = this.resolveStorageDir(projectSlug, nsCfg.id);
      const docs = loadMeta(storageDir, this.dataDir, projectSlug, nsCfg.id);
      if (docs.length === 0) continue;

      // Read all chunks from vector DB for this namespace
      const ns = vectorNs(projectSlug, nsCfg.id);
      if (!(await vectorDb.namespaceExists(ns))) continue;

      // For inject namespaces, retrieve all content (high topK, no threshold)
      const embeddingProvider = this.resolveEmbedding();
      if (!embeddingProvider) continue;

      // Use a dummy query to retrieve all — search with empty-ish vector, high topK
      // Better approach: read raw chunks from metadata. But vector DB is the source of truth for text.
      // Use a broad search with very high topK to get everything.
      const totalChunks = docs.reduce((sum, d) => sum + d.chunkCount, 0);
      if (totalChunks === 0) continue;

      const [queryVector] = await embeddingProvider.embed([nsCfg.label]);
      const results = await vectorDb.search(ns, queryVector, totalChunks);
      if (results.length === 0) continue;

      // Group by docId, reconstruct in order
      const byDoc = new Map<
        string,
        { filename: string; chunks: Map<number, string> }
      >();
      for (const r of results) {
        const docId = r.metadata.docId as string;
        const chunkIndex = r.metadata.chunkIndex as number;
        const filename = r.metadata.filename as string;
        if (!byDoc.has(docId))
          byDoc.set(docId, { filename, chunks: new Map() });
        byDoc.get(docId)!.chunks.set(chunkIndex, r.text);
      }

      const docTexts: string[] = [];
      for (const [, { chunks }] of byDoc) {
        const sorted = Array.from(chunks.entries()).sort((a, b) => a[0] - b[0]);
        docTexts.push(sorted.map(([, text]) => text).join('\n\n'));
      }

      sections.push(
        `<${nsCfg.id}_rules>\n${docTexts.join('\n\n')}\n</${nsCfg.id}_rules>`,
      );
    }

    if (sections.length === 0) return null;
    return `<project_rules>\n${sections.join('\n\n')}\n</project_rules>`;
  }

  // ── Directory scanning ──

  async scanDirectories(
    projectSlug: string,
    extensions?: string[],
    includePatterns?: string[],
    excludePatterns?: string[],
    namespace: string = 'code',
  ): Promise<{ indexed: number; skipped: number }> {
    const nsCfg = this.getNamespaceConfig(projectSlug, namespace);
    const _storageDir = this.resolveStorageDir(projectSlug, namespace);

    // Determine scan directory: namespace storageDir (files subdir or root), or project workingDirectory
    let scanPath: string | null = null;
    if (nsCfg?.storageDir) {
      // Scan the namespace's custom directory
      const filesDir = join(nsCfg.storageDir, 'files');
      scanPath = existsSync(filesDir) ? filesDir : nsCfg.storageDir;
    } else if (this.storageAdapter) {
      const project = this.storageAdapter.getProject(projectSlug);
      scanPath = project.workingDirectory ?? null;
    }

    if (!scanPath || !existsSync(scanPath)) return { indexed: 0, skipped: 0 };

    const allowedExts = extensions
      ? new Set(extensions.map((e) => (e.startsWith('.') ? e : `.${e}`)))
      : DEFAULT_EXTENSIONS;
    let indexed = 0;
    let skipped = 0;

    const files = this.collectFiles(scanPath, allowedExts);
    const filtered = this.applyPatterns(
      files,
      scanPath,
      includePatterns,
      excludePatterns,
    );

    for (const filePath of filtered) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        if (content.length === 0 || content.length > 500_000) {
          skipped++;
          continue;
        }
        const relPath = relative(scanPath, filePath);
        await this.uploadDocument(
          projectSlug,
          relPath,
          content,
          'directory-scan',
          namespace,
        );
        indexed++;
      } catch (e) {
        console.debug('Failed to index file during directory scan:', e);
        skipped++;
      }
    }

    return { indexed, skipped };
  }

  // ── Private helpers ──

  private findDocNamespace(projectSlug: string, docId: string): string | null {
    const namespaces = this.listNamespaces(projectSlug);
    for (const ns of namespaces) {
      const storageDir = this.resolveStorageDir(projectSlug, ns.id);
      const meta = loadMeta(storageDir, this.dataDir, projectSlug, ns.id);
      if (meta.some((d) => d.id === docId)) return ns.id;
    }
    return null;
  }

  private applyPatterns(
    files: string[],
    basePath: string,
    includePatterns?: string[],
    excludePatterns?: string[],
  ): string[] {
    if (!includePatterns?.length && !excludePatterns?.length) return files;
    return files.filter((f) => {
      const rel = relative(basePath, f);
      if (includePatterns?.length) {
        if (!includePatterns.some((p) => this.globMatch(rel, p))) return false;
      }
      if (excludePatterns?.length) {
        if (excludePatterns.some((p) => this.globMatch(rel, p))) return false;
      }
      return true;
    });
  }

  private globMatch(path: string, pattern: string): boolean {
    const regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*');
    return new RegExp(`^${regex}$`).test(path);
  }

  private collectFiles(
    dirPath: string,
    allowedExts: Set<string>,
    maxFiles = 200,
  ): string[] {
    const results: string[] = [];
    const walk = (current: string, depth: number) => {
      if (depth > 8 || results.length >= maxFiles) return;
      let entries: string[];
      try {
        entries = readdirSync(current);
      } catch (e) {
        console.debug(
          'Failed to read directory during knowledge scan:',
          current,
          e,
        );
        return;
      }
      for (const name of entries) {
        if (results.length >= maxFiles) break;
        const full = join(current, name);
        try {
          const stat = statSync(full);
          if (stat.isDirectory()) {
            if (!SKIP_DIRS.has(name)) walk(full, depth + 1);
          } else if (allowedExts.has(extname(name).toLowerCase())) {
            results.push(full);
          }
        } catch (e) {
          console.debug('Failed to stat file during knowledge scan:', e);
        }
      }
    };
    walk(dirPath, 0);
    return results;
  }
}
