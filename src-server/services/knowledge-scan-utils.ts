import { existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import type {
  KnowledgeNamespaceConfig,
  KnowledgeSearchFilter,
  KnowledgeTreeNode,
} from '@stallion-ai/contracts/knowledge';
import type { IStorageAdapter } from '../domain/storage-adapter.js';

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

export function matchesKnowledgeFilter(
  document: {
    path?: string;
    filename: string;
    status?: string;
    createdAt: string;
    metadata?: Record<string, unknown>;
  },
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

export function resolveKnowledgeScanPath(
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

export function normalizeKnowledgeExtension(extension: string): string {
  return extension.startsWith('.') ? extension : `.${extension}`;
}

export function applyKnowledgeScanPatterns(
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

export function collectKnowledgeFiles(
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

export function buildKnowledgeTree(
  dir: string,
  relPath: string,
  namespace: string,
  metadataByPath: Map<string, unknown>,
): KnowledgeTreeNode {
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
        const childNode = buildKnowledgeTree(
          fullPath,
          childRelPath,
          namespace,
          metadataByPath,
        );
        node.children!.push(childNode);
        node.fileCount! += childNode.fileCount ?? 0;
        continue;
      }

      const document = metadataByPath.get(childRelPath);
      node.children!.push({
        name: entry,
        path: childRelPath,
        type: 'file',
        doc: document as any,
      });
      node.fileCount! += 1;
    } catch {
      // Skip inaccessible files and directories.
    }
  }

  return node;
}

export { DEFAULT_EXTENSIONS };

function globMatch(path: string, pattern: string): boolean {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*');
  return new RegExp(`^${regex}$`).test(path);
}
