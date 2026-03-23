import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  IVectorDbProvider,
  VectorDocument,
  VectorSearchResult,
} from './types.js';
import { resolveHomeDir } from '../utils/paths.js';

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function vectorsFile(dataDir: string, namespace: string): string {
  return join(dataDir, namespace, 'vectors.json');
}

function loadDocs(dataDir: string, namespace: string): VectorDocument[] {
  const file = vectorsFile(dataDir, namespace);
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf-8')) as VectorDocument[];
}

function saveDocs(
  dataDir: string,
  namespace: string,
  docs: VectorDocument[],
): void {
  writeFileSync(vectorsFile(dataDir, namespace), JSON.stringify(docs), 'utf-8');
}

export class LanceDBProvider implements IVectorDbProvider {
  readonly id = 'lancedb-file';
  readonly displayName = 'File-based Vector Store';
  private dataDir: string;

  constructor({
    dataDir = join(resolveHomeDir(), 'vectordb'),
  }: { dataDir?: string } = {}) {
    this.dataDir = dataDir;
  }

  async createNamespace(namespace: string): Promise<void> {
    mkdirSync(join(this.dataDir, namespace), { recursive: true });
  }

  async deleteNamespace(namespace: string): Promise<void> {
    await rm(join(this.dataDir, namespace), { recursive: true, force: true });
  }

  async namespaceExists(namespace: string): Promise<boolean> {
    return existsSync(join(this.dataDir, namespace));
  }

  async addDocuments(namespace: string, docs: VectorDocument[]): Promise<void> {
    const existing = loadDocs(this.dataDir, namespace);
    const ids = new Set(docs.map((d) => d.id));
    const merged = [...existing.filter((d) => !ids.has(d.id)), ...docs];
    saveDocs(this.dataDir, namespace, merged);
  }

  async deleteDocuments(namespace: string, docIds: string[]): Promise<void> {
    const idSet = new Set(docIds);
    saveDocs(
      this.dataDir,
      namespace,
      loadDocs(this.dataDir, namespace).filter((d) => !idSet.has(d.id)),
    );
  }

  async search(
    namespace: string,
    query: number[],
    topK: number,
    threshold = 0,
  ): Promise<VectorSearchResult[]> {
    const docs = loadDocs(this.dataDir, namespace);
    return docs
      .map((d) => ({
        id: d.id,
        text: d.text,
        score: cosineSimilarity(query, d.vector),
        metadata: d.metadata,
      }))
      .filter((r) => r.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async count(namespace: string): Promise<number> {
    return loadDocs(this.dataDir, namespace).length;
  }

  async getByMetadata(namespace: string, key: string, value: string): Promise<VectorSearchResult[]> {
    return loadDocs(this.dataDir, namespace)
      .filter((d) => d.metadata[key] === value)
      .map((d) => ({ id: d.id, text: d.text, score: 1, metadata: d.metadata }));
  }
}
