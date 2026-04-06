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
  KnowledgeSearchFilter,
  KnowledgeTreeNode,
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
  // Split on markdown headings first, then paragraphs within sections
  const sections = text.split(/(?=^#{1,6}\s)/m);
  const chunks: string[] = [];
  let current = '';

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    if (current.length + trimmed.length + 2 <= maxChunkSize) {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    } else {
      if (current) chunks.push(current);
      if (trimmed.length <= maxChunkSize) {
        current = trimmed;
      } else {
        // Section too large — split by paragraphs
        const paragraphs = trimmed.split(/\n\n+/);
        current = '';
        for (const para of paragraphs) {
          const p = para.trim();
          if (!p) continue;
          if (current.length + p.length + 2 <= maxChunkSize) {
            current = current ? `${current}\n\n${p}` : p;
          } else {
            if (current) chunks.push(current);
            if (p.length <= maxChunkSize) {
              current = p;
            } else {
              // Paragraph too large — split by lines
              for (const line of p.split(/\n/)) {
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
      }
    }
  }
  if (current) chunks.push(current);

  // Add ~50 char overlap between chunks for context continuity
  if (chunks.length <= 1) return chunks;
  const overlapped: string[] = [chunks[0]];
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1];
    const overlap = prev.slice(-50).trimStart();
    overlapped.push(`${overlap}\n\n${chunks[i]}`);
  }
  return overlapped;
}

// ── Frontmatter parsing ────────────────────────────────────────────

function parseFrontmatter(content: string): {
  metadata: Record<string, any>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { metadata: {}, body: content };

  const yamlBlock = match[1];
  const body = match[2];
  const metadata: Record<string, any> = {};

  for (const line of yamlBlock.split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawVal] = kv;
    const val = rawVal.trim();
    // Array: [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      metadata[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''));
    } else if (val === 'true') {
      metadata[key] = true;
    } else if (val === 'false') {
      metadata[key] = false;
    } else if (/^\d+$/.test(val)) {
      metadata[key] = Number(val);
    } else {
      metadata[key] = val.replace(/^["']|["']$/g, '');
    }
  }

  return { metadata, body };
}

function serializeFrontmatter(
  metadata: Record<string, any>,
  body: string,
): string {
  const lines: string[] = [];
  for (const [key, val] of Object.entries(metadata)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      lines.push(`${key}: [${val.join(', ')}]`);
    } else if (typeof val === 'string' && val.includes(':')) {
      lines.push(`${key}: "${val}"`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  if (lines.length === 0) return body;
  return `---\n${lines.join('\n')}\n---\n${body}`;
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
  filePath: string,
  content: string,
): void {
  const fullPath = join(storageDir, 'files', filePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(dir || join(storageDir, 'files'), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}

function deleteFileFromDisk(storageDir: string, filePath: string): void {
  try {
    unlinkSync(join(storageDir, 'files', filePath));
  } catch {
    /* file may not exist */
  }
}

function readFileFromDisk(storageDir: string, filePath: string): string | null {
  try {
    return readFileSync(join(storageDir, 'files', filePath), 'utf-8');
  } catch {
    return null;
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
    source: 'upload' | 'directory-scan' | 'sync' = 'upload',
    namespace: string = DEFAULT_NS,
    extraMeta?: Record<string, any>,
  ): Promise<KnowledgeDocumentMeta> {
    const vectorDb = this.resolveVectorDb();
    if (!vectorDb) throw new Error('No vector DB provider configured');
    const ns = vectorNs(projectSlug, namespace);
    if (!(await vectorDb.namespaceExists(ns))) {
      await vectorDb.createNamespace(ns);
    }

    const nsCfg = this.getNamespaceConfig(projectSlug, namespace);
    const storageDir = this.resolveStorageDir(projectSlug, namespace);
    // Default writeFiles=true for new namespaces (unless explicitly false)
    const shouldWriteFiles = nsCfg?.writeFiles !== false;

    // Parse frontmatter — chunk body only
    const { metadata: fmMeta, body } = parseFrontmatter(content);

    // File-first: write to disk BEFORE indexing
    const filePath = filename;
    if (shouldWriteFiles) {
      writeFileToDisk(storageDir, filePath, content);
    }

    // Chunk the body (not frontmatter)
    const chunks = chunkText(body);
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
      ...(Object.keys(mergedMeta).length > 0 && { metadata: mergedMeta }),
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
    filter?: KnowledgeSearchFilter,
  ): Promise<KnowledgeDocumentMeta[]> {
    let docs: KnowledgeDocumentMeta[];
    if (namespace) {
      const storageDir = this.resolveStorageDir(projectSlug, namespace);
      docs = loadMeta(storageDir, this.dataDir, projectSlug, namespace);
    } else {
      const namespaces = this.listNamespaces(projectSlug);
      docs = [];
      for (const ns of namespaces) {
        const storageDir = this.resolveStorageDir(projectSlug, ns.id);
        docs.push(...loadMeta(storageDir, this.dataDir, projectSlug, ns.id));
      }
    }

    if (!filter) return docs;

    return docs.filter((d) => {
      if (
        filter.pathPrefix &&
        !(d.path || d.filename).startsWith(filter.pathPrefix)
      )
        return false;
      if (filter.status && d.status !== filter.status) return false;
      if (filter.after && d.createdAt < filter.after) return false;
      if (filter.before && d.createdAt > filter.before) return false;
      if (filter.tags?.length) {
        const docTags: string[] = (d.metadata?.tags as string[]) ?? [];
        if (!filter.tags.every((t) => docTags.includes(t))) return false;
      }
      if (filter.metadata) {
        for (const [key, val] of Object.entries(filter.metadata)) {
          const docVal = d.metadata?.[key];
          if (Array.isArray(val)) {
            if (!val.includes(String(docVal))) return false;
          } else if (String(docVal) !== val) {
            return false;
          }
        }
      }
      return true;
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

    const ns = vectorNs(projectSlug, targetNs);
    const storageDir = this.resolveStorageDir(projectSlug, targetNs);
    const meta = loadMeta(storageDir, this.dataDir, projectSlug, targetNs);
    const doc = meta.find((d) => d.id === docId);
    if (!doc)
      throw new Error(
        `Document '${docId}' not found in namespace '${targetNs}'`,
      );

    // File-first: delete from disk
    const filePath = doc.path || doc.filename;
    deleteFileFromDisk(storageDir, filePath);

    // Then remove from vector index
    const chunkIds = Array.from(
      { length: doc.chunkCount },
      (_, i) => `${docId}:${i}`,
    );
    await vectorDb.deleteDocuments(ns, chunkIds);

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
    const targetNs = namespace ?? this.findDocNamespace(projectSlug, docId);
    if (!targetNs) throw new Error(`Document '${docId}' not found`);

    const storageDir = this.resolveStorageDir(projectSlug, targetNs);
    const meta = loadMeta(storageDir, this.dataDir, projectSlug, targetNs);
    const doc = meta.find((d) => d.id === docId);
    if (!doc) throw new Error(`Document '${docId}' not found`);

    // File-first: try reading from disk
    const filePath = doc.path || doc.filename;
    const fileContent = readFileFromDisk(storageDir, filePath);
    if (fileContent !== null) return fileContent;

    // Fallback: reconstruct from vector chunks (backward compat)
    const vectorDb = this.resolveVectorDb();
    if (!vectorDb) throw new Error('No vector DB provider configured');

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
    const allMeta = loadMeta(storageDir, this.dataDir, projectSlug, targetNs);
    const docIdx = allMeta.findIndex((d) => d.id === docId);
    if (docIdx < 0) throw new Error(`Document '${docId}' not found`);
    const doc = allMeta[docIdx];

    const filePath = doc.path || doc.filename;
    let content = updates.content;
    let newMetadata = { ...doc.metadata, ...updates.metadata };

    if (content === undefined) {
      // Read existing content to re-index
      const existing = readFileFromDisk(storageDir, filePath);
      if (existing) {
        const { metadata: fmMeta, body } = parseFrontmatter(existing);
        newMetadata = { ...fmMeta, ...doc.metadata, ...updates.metadata };
        content = body;
      }
    } else {
      const { metadata: fmMeta, body } = parseFrontmatter(content);
      newMetadata = { ...fmMeta, ...updates.metadata };
      content = body;
    }

    // Write updated file to disk
    const nsCfg = this.getNamespaceConfig(projectSlug, targetNs);
    if (nsCfg?.writeFiles !== false) {
      const fileContent = serializeFrontmatter(newMetadata, content ?? '');
      writeFileToDisk(storageDir, filePath, fileContent);
    }

    // Re-index: delete old chunks, embed new
    const ns = vectorNs(projectSlug, targetNs);
    const oldChunkIds = Array.from(
      { length: doc.chunkCount },
      (_, i) => `${docId}:${i}`,
    );
    await vectorDb.deleteDocuments(ns, oldChunkIds);

    const chunks = chunkText(content ?? '');
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
    saveMeta(storageDir, allMeta);
    knowledgeOps.add(1, { op: 'update' });
    return updatedMeta;
  }

  // ── Directory tree ──

  getDirectoryTree(projectSlug: string, namespace: string): KnowledgeTreeNode {
    const storageDir = this.resolveStorageDir(projectSlug, namespace);
    const filesDir = join(storageDir, 'files');
    const meta = loadMeta(storageDir, this.dataDir, projectSlug, namespace);
    const metaByPath = new Map(meta.map((d) => [d.path || d.filename, d]));

    const buildTree = (dir: string, relPath: string): KnowledgeTreeNode => {
      const name = relPath ? relPath.split('/').pop()! : namespace;
      const node: KnowledgeTreeNode = {
        name,
        path: relPath || '.',
        type: 'directory',
        children: [],
        fileCount: 0,
      };

      if (!existsSync(dir)) return node;

      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return node;
      }

      for (const entry of entries.sort()) {
        const fullPath = join(dir, entry);
        const childRel = relPath ? `${relPath}/${entry}` : entry;
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            const child = buildTree(fullPath, childRel);
            node.children!.push(child);
            node.fileCount! += child.fileCount ?? 0;
          } else {
            const doc = metaByPath.get(childRel);
            node.children!.push({
              name: entry,
              path: childRel,
              type: 'file',
              doc,
            });
            node.fileCount! += 1;
          }
        } catch {
          /* skip inaccessible */
        }
      }

      return node;
    };

    return buildTree(filesDir, '');
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
