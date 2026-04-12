import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type {
  KnowledgeDocumentMeta,
  KnowledgeNamespaceConfig,
  KnowledgeSearchFilter,
  KnowledgeTreeNode,
} from '@stallion-ai/contracts/knowledge';
import type { IStorageAdapter } from '../domain/storage-adapter.js';
import {
  applyKnowledgeScanPatterns,
  buildKnowledgeTree,
  collectKnowledgeFiles,
  DEFAULT_EXTENSIONS,
  matchesKnowledgeFilter,
  normalizeKnowledgeExtension,
  resolveKnowledgeScanPath,
} from './knowledge-scan-utils.js';
import { loadKnowledgeMeta } from './knowledge-storage.js';

export function listKnowledgeDocuments({
  projectSlug,
  namespace,
  filter,
  dataDir,
  listNamespaces,
  resolveStorageDir,
}: {
  projectSlug: string;
  namespace?: string;
  filter?: KnowledgeSearchFilter;
  dataDir: string;
  listNamespaces(projectSlug: string): KnowledgeNamespaceConfig[];
  resolveStorageDir(projectSlug: string, namespace: string): string;
}): KnowledgeDocumentMeta[] {
  let docs: KnowledgeDocumentMeta[];
  if (namespace) {
    const storageDir = resolveStorageDir(projectSlug, namespace);
    docs = loadKnowledgeMeta(storageDir, dataDir, projectSlug, namespace);
  } else {
    docs = [];
    for (const namespaceConfig of listNamespaces(projectSlug)) {
      const storageDir = resolveStorageDir(projectSlug, namespaceConfig.id);
      docs.push(
        ...loadKnowledgeMeta(
          storageDir,
          dataDir,
          projectSlug,
          namespaceConfig.id,
        ),
      );
    }
  }

  if (!filter) return docs;
  return docs.filter((document) => matchesKnowledgeFilter(document, filter));
}

export function buildKnowledgeDirectoryTree({
  projectSlug,
  namespace,
  dataDir,
  resolveStorageDir,
}: {
  projectSlug: string;
  namespace: string;
  dataDir: string;
  resolveStorageDir(projectSlug: string, namespace: string): string;
}): KnowledgeTreeNode {
  const storageDir = resolveStorageDir(projectSlug, namespace);
  const filesDir = join(storageDir, 'files');
  const metadata = loadKnowledgeMeta(
    storageDir,
    dataDir,
    projectSlug,
    namespace,
  );
  const metadataByPath = new Map(
    metadata.map((document) => [document.path || document.filename, document]),
  );

  return buildKnowledgeTree(filesDir, '', namespace, metadataByPath);
}

export async function scanKnowledgeDirectories({
  projectSlug,
  namespace = 'code',
  extensions,
  includePatterns,
  excludePatterns,
  storageAdapter,
  getNamespaceConfig,
  uploadDocument,
}: {
  projectSlug: string;
  namespace?: string;
  extensions?: string[];
  includePatterns?: string[];
  excludePatterns?: string[];
  storageAdapter?: IStorageAdapter;
  getNamespaceConfig(
    projectSlug: string,
    namespace: string,
  ): KnowledgeNamespaceConfig | undefined;
  uploadDocument(
    projectSlug: string,
    filename: string,
    content: string,
    source: 'directory-scan',
    namespace: string,
  ): Promise<unknown>;
}): Promise<{ indexed: number; skipped: number }> {
  const scanPath = resolveKnowledgeScanPath(
    projectSlug,
    namespace,
    storageAdapter,
    getNamespaceConfig,
  );
  if (!scanPath || !existsSync(scanPath)) return { indexed: 0, skipped: 0 };

  const allowedExtensions = extensions
    ? new Set(extensions.map((extension) => normalizeKnowledgeExtension(extension)))
    : DEFAULT_EXTENSIONS;
  const files = collectKnowledgeFiles(scanPath, allowedExtensions);
  const filteredFiles = applyKnowledgeScanPatterns(
    files,
    scanPath,
    includePatterns,
    excludePatterns,
  );

  let indexed = 0;
  let skipped = 0;
  for (const filePath of filteredFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      if (content.length === 0 || content.length > 500_000) {
        skipped += 1;
        continue;
      }
      const relativePath = relative(scanPath, filePath);
      await uploadDocument(
        projectSlug,
        relativePath,
        content,
        'directory-scan',
        namespace,
      );
      indexed += 1;
    } catch (error) {
      console.debug('Failed to index file during directory scan:', error);
      skipped += 1;
    }
  }

  return { indexed, skipped };
}
