import crypto from 'node:crypto';
import { join } from 'node:path';
import {
  type KnowledgeDocumentMeta,
  type KnowledgeNamespaceConfig,
} from '@stallion-ai/contracts/knowledge';
import type {
  IEmbeddingProvider,
  IVectorDbProvider,
} from '../providers/model-provider-types.js';
import {
  chunkKnowledgeText,
  deleteKnowledgeFile,
  knowledgeVectorNamespace,
  loadKnowledgeMeta,
  parseKnowledgeFrontmatter,
  readKnowledgeFile,
  saveKnowledgeMeta,
  serializeKnowledgeFrontmatter,
  writeKnowledgeFile,
} from './knowledge-storage.js';

interface KnowledgeDocumentDeps {
  vectorDb: IVectorDbProvider | null;
  embeddingProvider: IEmbeddingProvider | null;
  dataDir: string;
  resolveStorageDir: (projectSlug: string, namespace: string) => string;
  getNamespaceConfig: (
    projectSlug: string,
    namespace: string,
  ) => KnowledgeNamespaceConfig | undefined;
  findDocNamespace: (projectSlug: string, docId: string) => string | null;
}

export async function uploadKnowledgeDocument(
  deps: KnowledgeDocumentDeps,
  projectSlug: string,
  filename: string,
  content: string,
  source: 'upload' | 'directory-scan' | 'sync' = 'upload',
  namespace = 'default',
  extraMeta?: Record<string, any>,
): Promise<KnowledgeDocumentMeta> {
  const { vectorDb, embeddingProvider } = deps;
  if (!vectorDb) {
    throw new Error('No vector DB provider configured');
  }

  const ns = knowledgeVectorNamespace(projectSlug, namespace);
  if (!(await vectorDb.namespaceExists(ns))) {
    await vectorDb.createNamespace(ns);
  }

  const nsCfg = deps.getNamespaceConfig(projectSlug, namespace);
  const storageDir = deps.resolveStorageDir(projectSlug, namespace);
  const shouldWriteFiles = nsCfg?.writeFiles !== false;
  const { metadata: fmMeta, body } = parseKnowledgeFrontmatter(content);
  const filePath = filename;

  if (shouldWriteFiles) {
    writeKnowledgeFile(storageDir, filePath, content);
  }

  const chunks = chunkKnowledgeText(body);
  const docId = crypto.randomUUID();
  const vectors =
    embeddingProvider && chunks.length > 0
      ? await embeddingProvider.embed(chunks)
      : chunks.map(() => []);

  await vectorDb.addDocuments(
    ns,
    chunks.map((text, i) => ({
      id: `${docId}:${i}`,
      vector: vectors[i],
      text,
      metadata: { docId, filename, namespace, chunkIndex: i },
    })),
  );

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
    deps.dataDir,
    projectSlug,
    namespace,
  );
  saveKnowledgeMeta(storageDir, [...existing, meta]);
  return meta;
}

export async function deleteKnowledgeDocument(
  deps: KnowledgeDocumentDeps,
  projectSlug: string,
  docId: string,
  namespace?: string,
): Promise<void> {
  const { vectorDb } = deps;
  if (!vectorDb) {
    throw new Error('No vector DB provider configured');
  }

  const targetNs = namespace ?? deps.findDocNamespace(projectSlug, docId);
  if (!targetNs) {
    throw new Error(`Document '${docId}' not found`);
  }

  const ns = knowledgeVectorNamespace(projectSlug, targetNs);
  const storageDir = deps.resolveStorageDir(projectSlug, targetNs);
  const meta = loadKnowledgeMeta(
    storageDir,
    deps.dataDir,
    projectSlug,
    targetNs,
  );
  const doc = meta.find((candidate) => candidate.id === docId);
  if (!doc) {
    throw new Error(`Document '${docId}' not found in namespace '${targetNs}'`);
  }

  deleteKnowledgeFile(storageDir, doc.path || doc.filename);
  await vectorDb.deleteDocuments(
    ns,
    Array.from({ length: doc.chunkCount }, (_, i) => `${docId}:${i}`),
  );
  saveKnowledgeMeta(
    storageDir,
    meta.filter((candidate) => candidate.id !== docId),
  );
}

export async function getKnowledgeDocumentContent(
  deps: KnowledgeDocumentDeps,
  projectSlug: string,
  docId: string,
  namespace?: string,
): Promise<string> {
  const targetNs = namespace ?? deps.findDocNamespace(projectSlug, docId);
  if (!targetNs) {
    throw new Error(`Document '${docId}' not found`);
  }

  const storageDir = deps.resolveStorageDir(projectSlug, targetNs);
  const meta = loadKnowledgeMeta(
    storageDir,
    deps.dataDir,
    projectSlug,
    targetNs,
  );
  const doc = meta.find((candidate) => candidate.id === docId);
  if (!doc) {
    throw new Error(`Document '${docId}' not found`);
  }

  const fileContent = readKnowledgeFile(storageDir, doc.path || doc.filename);
  if (fileContent !== null) {
    return fileContent;
  }

  const { vectorDb } = deps;
  if (!vectorDb) {
    throw new Error('No vector DB provider configured');
  }

  const ns = knowledgeVectorNamespace(projectSlug, targetNs);
  if (!(await vectorDb.namespaceExists(ns))) {
    throw new Error('Vector namespace not found');
  }

  const results = await vectorDb.getByMetadata(ns, 'docId', docId);
  const chunks = new Map<number, string>();
  for (const result of results) {
    chunks.set(result.metadata.chunkIndex as number, result.text);
  }
  return Array.from(chunks.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, text]) => text)
    .join('\n\n');
}

export async function updateKnowledgeDocument(
  deps: KnowledgeDocumentDeps,
  projectSlug: string,
  docId: string,
  updates: { content?: string; metadata?: Record<string, any> },
  namespace?: string,
): Promise<KnowledgeDocumentMeta> {
  const { vectorDb, embeddingProvider } = deps;
  if (!vectorDb) {
    throw new Error('No vector DB provider configured');
  }

  const targetNs = namespace ?? deps.findDocNamespace(projectSlug, docId);
  if (!targetNs) {
    throw new Error(`Document '${docId}' not found`);
  }

  const storageDir = deps.resolveStorageDir(projectSlug, targetNs);
  const allMeta = loadKnowledgeMeta(
    storageDir,
    deps.dataDir,
    projectSlug,
    targetNs,
  );
  const docIdx = allMeta.findIndex((candidate) => candidate.id === docId);
  if (docIdx < 0) {
    throw new Error(`Document '${docId}' not found`);
  }

  const doc = allMeta[docIdx];
  const filePath = doc.path || doc.filename;
  let content = updates.content;
  let newMetadata = { ...doc.metadata, ...updates.metadata };

  if (content === undefined) {
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

  const nsCfg = deps.getNamespaceConfig(projectSlug, targetNs);
  if (nsCfg?.writeFiles !== false) {
    writeKnowledgeFile(
      storageDir,
      filePath,
      serializeKnowledgeFrontmatter(newMetadata, content ?? ''),
    );
  }

  await vectorDb.deleteDocuments(
    knowledgeVectorNamespace(projectSlug, targetNs),
    Array.from({ length: doc.chunkCount }, (_, i) => `${docId}:${i}`),
  );

  const chunks = chunkKnowledgeText(content ?? '');
  const vectors =
    embeddingProvider && chunks.length > 0
      ? await embeddingProvider.embed(chunks)
      : chunks.map(() => []);
  if (chunks.length > 0) {
    await vectorDb.addDocuments(
      knowledgeVectorNamespace(projectSlug, targetNs),
      chunks.map((text, i) => ({
        id: `${docId}:${i}`,
        vector: vectors[i],
        text,
        metadata: {
          docId,
          filename: doc.filename,
          namespace: targetNs,
          chunkIndex: i,
        },
      })),
    );
  }

  const updatedMeta: KnowledgeDocumentMeta = {
    ...doc,
    chunkCount: chunks.length,
    updatedAt: new Date().toISOString(),
    ...(Object.keys(newMetadata).length > 0 && { metadata: newMetadata }),
  };
  allMeta[docIdx] = updatedMeta;
  saveKnowledgeMeta(storageDir, allMeta);
  return updatedMeta;
}
