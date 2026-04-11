import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { KnowledgeDocumentMeta } from '@stallion-ai/contracts/knowledge';

export const DEFAULT_KNOWLEDGE_NAMESPACE = 'default';

export function chunkKnowledgeText(
  text: string,
  maxChunkSize = 500,
): string[] {
  const sections = text.split(/(?=^#{1,6}\s)/m);
  const chunks: string[] = [];
  let current = '';

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    if (current.length + trimmed.length + 2 <= maxChunkSize) {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
      continue;
    }

    if (current) chunks.push(current);
    if (trimmed.length <= maxChunkSize) {
      current = trimmed;
      continue;
    }

    const paragraphs = trimmed.split(/\n\n+/);
    current = '';
    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim();
      if (!trimmedParagraph) continue;

      if (current.length + trimmedParagraph.length + 2 <= maxChunkSize) {
        current = current
          ? `${current}\n\n${trimmedParagraph}`
          : trimmedParagraph;
        continue;
      }

      if (current) chunks.push(current);
      if (trimmedParagraph.length <= maxChunkSize) {
        current = trimmedParagraph;
        continue;
      }

      current = '';
      for (const line of trimmedParagraph.split(/\n/)) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        if (current.length + trimmedLine.length + 1 <= maxChunkSize) {
          current = current ? `${current}\n${trimmedLine}` : trimmedLine;
        } else {
          if (current) chunks.push(current);
          current = trimmedLine;
        }
      }
    }
  }

  if (current) chunks.push(current);
  if (chunks.length <= 1) return chunks;

  const overlapped: string[] = [chunks[0]];
  for (let index = 1; index < chunks.length; index += 1) {
    const overlap = chunks[index - 1].slice(-50).trimStart();
    overlapped.push(`${overlap}\n\n${chunks[index]}`);
  }
  return overlapped;
}

export function parseKnowledgeFrontmatter(content: string): {
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
    const value = rawVal.trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      metadata[key] = value
        .slice(1, -1)
        .split(',')
        .map((segment) => segment.trim().replace(/^["']|["']$/g, ''));
    } else if (value === 'true') {
      metadata[key] = true;
    } else if (value === 'false') {
      metadata[key] = false;
    } else if (/^\d+$/.test(value)) {
      metadata[key] = Number(value);
    } else {
      metadata[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  return { metadata, body };
}

export function serializeKnowledgeFrontmatter(
  metadata: Record<string, any>,
  body: string,
): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(', ')}]`);
    } else if (typeof value === 'string' && value.includes(':')) {
      lines.push(`${key}: "${value}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  if (lines.length === 0) return body;
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

export function defaultKnowledgeStorageDir(
  dataDir: string,
  projectSlug: string,
  namespace: string,
): string {
  return join(dataDir, 'projects', projectSlug, 'knowledge', namespace);
}

function legacyNamespaceMetaFile(
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

function legacyFlatMetaFile(dataDir: string, projectSlug: string): string {
  return join(dataDir, 'projects', projectSlug, 'documents', 'metadata.json');
}

export function loadKnowledgeMeta(
  storageDir: string,
  dataDir: string,
  projectSlug: string,
  namespace: string,
): KnowledgeDocumentMeta[] {
  const newFile = join(storageDir, 'metadata.json');
  if (existsSync(newFile)) {
    return JSON.parse(
      readFileSync(newFile, 'utf-8'),
    ) as KnowledgeDocumentMeta[];
  }

  const oldNamespaceFile = legacyNamespaceMetaFile(
    dataDir,
    projectSlug,
    namespace,
  );
  if (existsSync(oldNamespaceFile)) {
    const docs = JSON.parse(
      readFileSync(oldNamespaceFile, 'utf-8'),
    ) as KnowledgeDocumentMeta[];
    mkdirSync(storageDir, { recursive: true });
    writeFileSync(newFile, JSON.stringify(docs, null, 2), 'utf-8');
    return docs;
  }

  if (namespace === DEFAULT_KNOWLEDGE_NAMESPACE) {
    const flatFile = legacyFlatMetaFile(dataDir, projectSlug);
    if (existsSync(flatFile)) {
      const docs = JSON.parse(readFileSync(flatFile, 'utf-8')) as any[];
      const migrated = docs.map((doc) => ({
        ...doc,
        namespace: DEFAULT_KNOWLEDGE_NAMESPACE,
      }));
      mkdirSync(storageDir, { recursive: true });
      writeFileSync(newFile, JSON.stringify(migrated, null, 2), 'utf-8');
      return migrated;
    }
  }

  return [];
}

export function saveKnowledgeMeta(
  storageDir: string,
  docs: KnowledgeDocumentMeta[],
): void {
  mkdirSync(storageDir, { recursive: true });
  writeFileSync(
    join(storageDir, 'metadata.json'),
    JSON.stringify(docs, null, 2),
    'utf-8',
  );
}

export function writeKnowledgeFile(
  storageDir: string,
  filePath: string,
  content: string,
): void {
  const fullPath = join(storageDir, 'files', filePath);
  const directory = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(directory || join(storageDir, 'files'), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}

export function deleteKnowledgeFile(
  storageDir: string,
  filePath: string,
): void {
  try {
    unlinkSync(join(storageDir, 'files', filePath));
  } catch {
    /* file may not exist */
  }
}

export function readKnowledgeFile(
  storageDir: string,
  filePath: string,
): string | null {
  try {
    return readFileSync(join(storageDir, 'files', filePath), 'utf-8');
  } catch {
    return null;
  }
}

export function knowledgeVectorNamespace(
  projectSlug: string,
  namespace: string,
): string {
  return namespace === DEFAULT_KNOWLEDGE_NAMESPACE
    ? `project-${projectSlug}`
    : `project-${projectSlug}:${namespace}`;
}
