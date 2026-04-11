import type { DocMeta, KnowledgeSearchResult } from './types';

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function buildRulesContent(results: KnowledgeSearchResult[] = []) {
  const byDoc = new Map<string, Map<number, string>>();
  for (const result of results) {
    const docId = result.metadata?.docId;
    if (!docId) {
      continue;
    }
    if (!byDoc.has(docId)) {
      byDoc.set(docId, new Map());
    }
    byDoc.get(docId)?.set(result.metadata?.chunkIndex ?? 0, result.text);
  }

  const parts: string[] = [];
  for (const chunks of byDoc.values()) {
    const sorted = Array.from(chunks.entries()).sort((a, b) => a[0] - b[0]);
    parts.push(sorted.map(([, text]) => text).join('\n\n'));
  }

  return parts.join('\n\n---\n\n');
}

export function splitKnowledgeDocs(docs: DocMeta[], selectedNs: string | null) {
  const filteredDocs = selectedNs
    ? docs.filter((doc) => (doc.namespace || 'default') === selectedNs)
    : docs;

  return {
    filteredDocs,
    dirDocs: filteredDocs.filter((doc) => doc.source === 'directory-scan'),
    uploadDocs: filteredDocs.filter((doc) => doc.source !== 'directory-scan'),
  };
}

export function buildKnowledgeScanOptions(
  scanInclude: string,
  scanExclude: string,
) {
  const includePatterns = scanInclude
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const excludePatterns = scanExclude
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const options: Record<string, string[]> = {};
  if (includePatterns.length > 0) {
    options.includePatterns = includePatterns;
  }
  if (excludePatterns.length > 0) {
    options.excludePatterns = excludePatterns;
  }
  return options;
}
