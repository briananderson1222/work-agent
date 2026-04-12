import { _getApiBase } from './api-core';
import {
  buildKnowledgeFilterQuery,
  knowledgeBase,
  requestKnowledgeJson,
} from './api-knowledge-utils';

export async function fetchKnowledgeNamespaces(
  projectSlug: string,
): Promise<any[]> {
  return requestKnowledgeJson(
    `/api/projects/${encodeURIComponent(projectSlug)}/knowledge/namespaces`,
    { errorPrefix: 'Failed to fetch namespaces' },
  );
}

export async function fetchKnowledgeDocs(
  projectSlug: string,
  namespace?: string,
): Promise<any[]> {
  const apiBase = await _getApiBase();
  return requestKnowledgeJson(knowledgeBase(apiBase, projectSlug, namespace), {
    errorPrefix: 'Failed to fetch knowledge docs',
  });
}

export async function searchKnowledge(
  projectSlug: string,
  query: string,
  namespace?: string,
  topK?: number,
): Promise<any[]> {
  const apiBase = await _getApiBase();
  return requestKnowledgeJson(
    `${knowledgeBase(apiBase, projectSlug, namespace)}/search`,
    {
      method: 'POST',
      body: { query, topK },
      errorPrefix: 'Knowledge search failed',
    },
  );
}

export async function uploadKnowledge(
  projectSlug: string,
  filename: string,
  content: string,
  namespace?: string,
  metadata?: Record<string, any>,
): Promise<any> {
  const apiBase = await _getApiBase();
  return requestKnowledgeJson(
    `${knowledgeBase(apiBase, projectSlug, namespace)}/upload`,
    {
      method: 'POST',
      body: {
        filename,
        content,
        ...(metadata && { metadata }),
      },
      errorPrefix: 'Knowledge upload failed',
    },
  );
}

export async function deleteKnowledgeDoc(
  projectSlug: string,
  docId: string,
  namespace?: string,
): Promise<void> {
  const apiBase = await _getApiBase();
  await requestKnowledgeJson(
    `${knowledgeBase(apiBase, projectSlug, namespace)}/${encodeURIComponent(docId)}`,
    {
      method: 'DELETE',
      errorPrefix: 'Knowledge delete failed',
    },
  );
}

export async function bulkDeleteKnowledgeDocs(
  projectSlug: string,
  ids: string[],
  namespace?: string,
): Promise<void> {
  const apiBase = await _getApiBase();
  await requestKnowledgeJson(
    `${knowledgeBase(apiBase, projectSlug, namespace)}/bulk-delete`,
    {
      method: 'POST',
      body: { ids },
      errorPrefix: 'Knowledge bulk delete failed',
    },
  );
}

export async function fetchKnowledgeDocContent(
  projectSlug: string,
  docId: string,
  namespace?: string,
): Promise<string> {
  const apiBase = await _getApiBase();
  const data = await requestKnowledgeJson<{ content: string }>(
    `${knowledgeBase(apiBase, projectSlug, namespace)}/${encodeURIComponent(docId)}/content`,
    { errorPrefix: 'Failed to fetch doc content' },
  );
  return data.content;
}

export async function fetchKnowledgeStatus(projectSlug: string): Promise<any> {
  return requestKnowledgeJson(
    `/api/projects/${encodeURIComponent(projectSlug)}/knowledge/status`,
    { errorPrefix: 'Failed to fetch knowledge status' },
  );
}

export async function scanKnowledgeDirectory(
  projectSlug: string,
  options?: {
    extensions?: string[];
    includePatterns?: string[];
    excludePatterns?: string[];
  },
): Promise<any> {
  const apiBase = await _getApiBase();
  return requestKnowledgeJson(`${knowledgeBase(apiBase, projectSlug)}/scan`, {
    method: 'POST',
    body: options ?? {},
    errorPrefix: 'Knowledge scan failed',
  });
}

export async function fetchProjectConversations(
  projectSlug: string,
  limit = 10,
): Promise<any[]> {
  return requestKnowledgeJson(
    `/api/projects/${encodeURIComponent(projectSlug)}/conversations?limit=${limit}`,
    {
      errorPrefix: 'Failed to fetch project conversations',
      allowFailure: true,
    },
  );
}

export async function addProjectLayoutFromPlugin(
  projectSlug: string,
  plugin: string,
): Promise<any> {
  return requestKnowledgeJson(
    `/api/projects/${encodeURIComponent(projectSlug)}/layouts/from-plugin`,
    {
      method: 'POST',
      body: { plugin },
      errorPrefix: 'Failed to add layout from plugin',
    },
  );
}

export async function fetchAvailableLayouts(): Promise<any[]> {
  return requestKnowledgeJson('/api/projects/layouts/available', {
    errorPrefix: 'Failed to fetch available layouts',
    allowFailure: true,
  });
}

export async function updateKnowledgeNamespace(
  projectSlug: string,
  namespaceId: string,
  data: Record<string, any>,
): Promise<any> {
  return requestKnowledgeJson(
    `/api/projects/${encodeURIComponent(projectSlug)}/knowledge/namespaces/${encodeURIComponent(namespaceId)}`,
    {
      method: 'PUT',
      body: data,
      errorPrefix: 'Failed to update namespace',
    },
  );
}

export async function fetchKnowledgeTree(
  projectSlug: string,
  namespace: string,
): Promise<any> {
  const apiBase = await _getApiBase();
  return requestKnowledgeJson(
    `${knowledgeBase(apiBase, projectSlug, namespace)}/tree`,
    { errorPrefix: 'Failed to fetch tree' },
  );
}

export async function fetchKnowledgeFiltered(
  projectSlug: string,
  namespace: string,
  filters: Record<string, any>,
): Promise<any[]> {
  const apiBase = await _getApiBase();
  const qs = buildKnowledgeFilterQuery(filters);
  const url = `${knowledgeBase(apiBase, projectSlug, namespace)}${qs ? `?${qs}` : ''}`;
  return requestKnowledgeJson(url, {
    errorPrefix: 'Failed to fetch filtered docs',
  });
}

export async function updateKnowledgeDoc(
  projectSlug: string,
  docId: string,
  updates: { content?: string; metadata?: Record<string, any> },
  namespace?: string,
): Promise<any> {
  const apiBase = await _getApiBase();
  return requestKnowledgeJson(
    `${knowledgeBase(apiBase, projectSlug, namespace)}/${encodeURIComponent(docId)}`,
    {
      method: 'PUT',
      body: updates,
      errorPrefix: 'Failed to update doc',
    },
  );
}
