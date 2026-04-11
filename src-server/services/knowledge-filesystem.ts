import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { extname, join, relative } from 'node:path';
import type {
  KnowledgeDocumentMeta,
  KnowledgeNamespaceConfig,
  KnowledgeSearchFilter,
  KnowledgeTreeNode,
} from '@stallion-ai/contracts/knowledge';
import type { IStorageAdapter } from '../domain/storage-adapter.js';
import { loadKnowledgeMeta } from './knowledge-storage.js';

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
  const metadata = loadKnowledgeMeta(storageDir, dataDir, projectSlug, namespace);
  const metadataByPath = new Map(
    metadata.map((document) => [document.path || document.filename, document]),
  );

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
      const childRelPath = relPath ? `${relPath}/${entry}` : entry;
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          const childNode = buildTree(fullPath, childRelPath);
          node.children!.push(childNode);
          node.fileCount! += childNode.fileCount ?? 0;
          continue;
        }

        const document = metadataByPath.get(childRelPath);
        node.children!.push({
          name: entry,
          path: childRelPath,
          type: 'file',
          doc: document,
        });
        node.fileCount! += 1;
      } catch {
        // Skip inaccessible files and directories.
      }
    }

    return node;
  };

  return buildTree(filesDir, '');
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
    ? new Set(extensions.map((extension) => normalizeExtension(extension)))
    : DEFAULT_EXTENSIONS;
  const files = collectKnowledgeFiles(scanPath, allowedExtensions);
  const filteredFiles = applyScanPatterns(
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

function matchesKnowledgeFilter(
  document: KnowledgeDocumentMeta,
  filter: KnowledgeSearchFilter,
): boolean {
  if (
    filter.pathPrefix &&
    !(document.path || document.filename).startsWith(filter.pathPrefix)
  ) {
    return false;
  }
  if (filter.status && document.status !== filter.status) return false;
  if (filter.after && document.createdAt < filter.after) return false;
  if (filter.before && document.createdAt > filter.before) return false;
  if (filter.tags?.length) {
    const documentTags: string[] = (document.metadata?.tags as string[]) ?? [];
    if (!filter.tags.every((tag) => documentTags.includes(tag))) return false;
  }
  if (!filter.metadata) return true;

  for (const [key, value] of Object.entries(filter.metadata)) {
    const documentValue = document.metadata?.[key];
    if (Array.isArray(value)) {
      if (!value.includes(String(documentValue))) return false;
      continue;
    }
    if (String(documentValue) !== value) return false;
  }

  return true;
}

function resolveKnowledgeScanPath(
  projectSlug: string,
  namespace: string,
  storageAdapter: IStorageAdapter | undefined,
  getNamespaceConfig: (
    projectSlug: string,
    namespace: string,
  ) => KnowledgeNamespaceConfig | undefined,
): string | null {
  const namespaceConfig = getNamespaceConfig(projectSlug, namespace);
  if (namespaceConfig?.storageDir) {
    const filesDir = join(namespaceConfig.storageDir, 'files');
    return existsSync(filesDir) ? filesDir : namespaceConfig.storageDir;
  }

  if (!storageAdapter) return null;
  const project = storageAdapter.getProject(projectSlug);
  return project.workingDirectory ?? null;
}

function normalizeExtension(extension: string): string {
  return extension.startsWith('.') ? extension : `.${extension}`;
}

function applyScanPatterns(
  files: string[],
  basePath: string,
  includePatterns?: string[],
  excludePatterns?: string[],
): string[] {
  if (!includePatterns?.length && !excludePatterns?.length) return files;

  return files.filter((filePath) => {
    const relativePath = relative(basePath, filePath);
    if (
      includePatterns?.length &&
      !includePatterns.some((pattern) => globMatch(relativePath, pattern))
    ) {
      return false;
    }
    if (
      excludePatterns?.length &&
      excludePatterns.some((pattern) => globMatch(relativePath, pattern))
    ) {
      return false;
    }
    return true;
  });
}

function globMatch(path: string, pattern: string): boolean {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*');
  return new RegExp(`^${regex}$`).test(path);
}

function collectKnowledgeFiles(
  dirPath: string,
  allowedExtensions: Set<string>,
  maxFiles = 200,
): string[] {
  const results: string[] = [];
  const walk = (currentPath: string, depth: number) => {
    if (depth > 8 || results.length >= maxFiles) return;

    let entries: string[];
    try {
      entries = readdirSync(currentPath);
    } catch (error) {
      console.debug(
        'Failed to read directory during knowledge scan:',
        currentPath,
        error,
      );
      return;
    }

    for (const name of entries) {
      if (results.length >= maxFiles) break;
      const fullPath = join(currentPath, name);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (!SKIP_DIRS.has(name)) walk(fullPath, depth + 1);
          continue;
        }
        if (allowedExtensions.has(extname(name).toLowerCase())) {
          results.push(fullPath);
        }
      } catch (error) {
        console.debug('Failed to stat file during knowledge scan:', error);
      }
    }
  };

  walk(dirPath, 0);
  return results;
}
