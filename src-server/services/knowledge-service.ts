import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, relative } from 'node:path';
import type { IStorageAdapter } from '../domain/storage-adapter.js';
import type {
  IEmbeddingProvider,
  IVectorDbProvider,
} from '../providers/types.js';
import { knowledgeOps } from '../telemetry/metrics.js';

export interface DocumentMeta {
  id: string;
  filename: string;
  source: 'upload' | 'directory-scan';
  chunkCount: number;
  createdAt: string;
}

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
        // Split long paragraphs by line
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

function metaFile(dataDir: string, projectSlug: string): string {
  return join(dataDir, 'projects', projectSlug, 'documents', 'metadata.json');
}

function loadMeta(dataDir: string, projectSlug: string): DocumentMeta[] {
  const file = metaFile(dataDir, projectSlug);
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf-8')) as DocumentMeta[];
}

function saveMeta(
  dataDir: string,
  projectSlug: string,
  docs: DocumentMeta[],
): void {
  const file = metaFile(dataDir, projectSlug);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(docs, null, 2), 'utf-8');
}

export class KnowledgeService {
  constructor(
    private resolveVectorDb: () => IVectorDbProvider | null,
    private resolveEmbedding: () => IEmbeddingProvider | null,
    private dataDir: string,
    private storageAdapter?: IStorageAdapter,
  ) {}

  async uploadDocument(
    projectSlug: string,
    filename: string,
    content: string,
    source: 'upload' | 'directory-scan' = 'upload',
  ): Promise<DocumentMeta> {
    const vectorDb = this.resolveVectorDb();
    if (!vectorDb) throw new Error('No vector DB provider configured');
    const ns = `project-${projectSlug}`;
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
      metadata: { docId, filename, chunkIndex: i },
    }));

    await vectorDb.addDocuments(ns, docs);

    const meta: DocumentMeta = {
      id: docId,
      filename,
      source,
      chunkCount: chunks.length,
      createdAt: new Date().toISOString(),
    };
    const existing = loadMeta(this.dataDir, projectSlug);
    saveMeta(this.dataDir, projectSlug, [...existing, meta]);
    knowledgeOps.add(1, { op: 'index' });
    return meta;
  }

  async searchDocuments(projectSlug: string, query: string, topK = 5) {
    const vectorDb = this.resolveVectorDb();
    if (!vectorDb) return [];
    const ns = `project-${projectSlug}`;
    if (!(await vectorDb.namespaceExists(ns))) return [];
    const embeddingProvider = this.resolveEmbedding();
    if (!embeddingProvider) return [];
    const [queryVector] = await embeddingProvider.embed([query]);
    const results = await vectorDb.search(ns, queryVector, topK);
    knowledgeOps.add(1, { op: 'query' });
    return results;
  }

  /**
   * Retrieve RAG context for a chat message within a project.
   * Returns a formatted string to prepend to the system prompt, or null if no relevant context.
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

  async listDocuments(projectSlug: string): Promise<DocumentMeta[]> {
    return loadMeta(this.dataDir, projectSlug);
  }

  async deleteDocument(projectSlug: string, docId: string): Promise<void> {
    const vectorDb = this.resolveVectorDb();
    if (!vectorDb) throw new Error('No vector DB provider configured');
    const ns = `project-${projectSlug}`;
    const meta = loadMeta(this.dataDir, projectSlug);
    const doc = meta.find((d) => d.id === docId);
    if (!doc) throw new Error(`Document '${docId}' not found`);

    const chunkIds = Array.from(
      { length: doc.chunkCount },
      (_, i) => `${docId}:${i}`,
    );
    await vectorDb.deleteDocuments(ns, chunkIds);
    saveMeta(
      this.dataDir,
      projectSlug,
      meta.filter((d) => d.id !== docId),
    );
    knowledgeOps.add(1, { op: 'delete' });
  }

  /**
   * Scan project working directories and index text files.
   */
  async scanDirectories(
    projectSlug: string,
    extensions?: string[],
    includePatterns?: string[],
    excludePatterns?: string[],
  ): Promise<{ indexed: number; skipped: number }> {
    if (!this.storageAdapter)
      throw new Error('Storage adapter required for directory scanning');

    const project = this.storageAdapter.getProject(projectSlug);
    if (!project.workingDirectory) {
      return { indexed: 0, skipped: 0 };
    }

    const allowedExts = extensions
      ? new Set(extensions.map((e) => (e.startsWith('.') ? e : `.${e}`)))
      : DEFAULT_EXTENSIONS;
    let indexed = 0;
    let skipped = 0;

    const dirPath = project.workingDirectory;
    if (!existsSync(dirPath)) {
      skipped++;
    } else {
      const files = this.collectFiles(dirPath, allowedExts);

      // Apply include/exclude glob patterns
      const filtered = this.applyPatterns(
        files,
        dirPath,
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
          const relPath = relative(dirPath, filePath);
          await this.uploadDocument(
            projectSlug,
            relPath,
            content,
            'directory-scan',
          );
          indexed++;
        } catch (e) {
          console.debug('Failed to index file during directory scan:', e);
          skipped++;
        }
      }
    }

    return { indexed, skipped };
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
        const included = includePatterns.some((p) => this.globMatch(rel, p));
        if (!included) return false;
      }
      if (excludePatterns?.length) {
        const excluded = excludePatterns.some((p) => this.globMatch(rel, p));
        if (excluded) return false;
      }
      return true;
    });
  }

  /** Simple glob matching: supports * and ** */
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
        console.debug('Failed to read directory during knowledge scan:', current, e);
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
          /* skip */
        }
      }
    };
    walk(dirPath, 0);
    return results;
  }
}
