import { _getApiBase, getPluginHeaders } from './api-core';

function knowledgeBase(
  apiBase: string,
  projectSlug: string,
  namespace?: string,
): string {
  const base = `${apiBase}/api/projects/${encodeURIComponent(projectSlug)}/knowledge`;
  return namespace ? `${base}/ns/${encodeURIComponent(namespace)}` : base;
}

export async function fetchKnowledgeNamespaces(
  projectSlug: string,
): Promise<any[]> {
  const apiBase = await _getApiBase();
  const res = await fetch(
    `${apiBase}/api/projects/${encodeURIComponent(projectSlug)}/knowledge/namespaces`,
    { headers: getPluginHeaders() },
  );
  if (!res.ok) throw new Error(`Failed to fetch namespaces: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function fetchKnowledgeDocs(
  projectSlug: string,
  namespace?: string,
): Promise<any[]> {
  const apiBase = await _getApiBase();
  const res = await fetch(knowledgeBase(apiBase, projectSlug, namespace), {
    headers: getPluginHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch knowledge docs: ${res.statusText}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function searchKnowledge(
  projectSlug: string,
  query: string,
  namespace?: string,
  topK?: number,
): Promise<any[]> {
  const apiBase = await _getApiBase();
  const res = await fetch(
    `${knowledgeBase(apiBase, projectSlug, namespace)}/search`,
    {
      method: 'POST',
      headers: getPluginHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ query, topK }),
    },
  );
  if (!res.ok) throw new Error(`Knowledge search failed: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function uploadKnowledge(
  projectSlug: string,
  filename: string,
  content: string,
  namespace?: string,
  metadata?: Record<string, any>,
): Promise<any> {
  const apiBase = await _getApiBase();
  const res = await fetch(
    `${knowledgeBase(apiBase, projectSlug, namespace)}/upload`,
    {
      method: 'POST',
      headers: getPluginHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        filename,
        content,
        ...(metadata && { metadata }),
      }),
    },
  );
  if (!res.ok) throw new Error(`Knowledge upload failed: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function deleteKnowledgeDoc(
  projectSlug: string,
  docId: string,
  namespace?: string,
): Promise<void> {
  const apiBase = await _getApiBase();
  const res = await fetch(
    `${knowledgeBase(apiBase, projectSlug, namespace)}/${encodeURIComponent(docId)}`,
    {
      method: 'DELETE',
      headers: getPluginHeaders(),
    },
  );
  if (!res.ok) throw new Error(`Knowledge delete failed: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}

export async function bulkDeleteKnowledgeDocs(
  projectSlug: string,
  ids: string[],
  namespace?: string,
): Promise<void> {
  const apiBase = await _getApiBase();
  const res = await fetch(
    `${knowledgeBase(apiBase, projectSlug, namespace)}/bulk-delete`,
    {
      method: 'POST',
      headers: getPluginHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ids }),
    },
  );
  if (!res.ok) {
    throw new Error(`Knowledge bulk delete failed: ${res.statusText}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}

export async function fetchKnowledgeDocContent(
  projectSlug: string,
  docId: string,
  namespace?: string,
): Promise<string> {
  const apiBase = await _getApiBase();
  const res = await fetch(
    `${knowledgeBase(apiBase, projectSlug, namespace)}/${encodeURIComponent(docId)}/content`,
    {
      headers: getPluginHeaders(),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch doc content: ${res.statusText}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data.content;
}

export async function fetchKnowledgeStatus(projectSlug: string): Promise<any> {
  const apiBase = await _getApiBase();
  const res = await fetch(
    `${apiBase}/api/projects/${encodeURIComponent(projectSlug)}/knowledge/status`,
    {
      headers: getPluginHeaders(),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch knowledge status: ${res.statusText}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
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
  const res = await fetch(`${knowledgeBase(apiBase, projectSlug)}/scan`, {
    method: 'POST',
    headers: getPluginHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok) throw new Error(`Knowledge scan failed: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function fetchProjectConversations(
  projectSlug: string,
  limit = 10,
): Promise<any[]> {
  const apiBase = await _getApiBase();
  const res = await fetch(
    `${apiBase}/api/projects/${encodeURIComponent(projectSlug)}/conversations?limit=${limit}`,
    {
      headers: getPluginHeaders(),
    },
  );
  if (!res.ok) return [];
  const json = await res.json();
  return json.success ? json.data : [];
}

export async function addProjectLayoutFromPlugin(
  projectSlug: string,
  plugin: string,
): Promise<any> {
  const apiBase = await _getApiBase();
  const res = await fetch(
    `${apiBase}/api/projects/${encodeURIComponent(projectSlug)}/layouts/from-plugin`,
    {
      method: 'POST',
      headers: getPluginHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ plugin }),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to add layout from plugin: ${res.statusText}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function fetchAvailableLayouts(): Promise<any[]> {
  const apiBase = await _getApiBase();
  const res = await fetch(`${apiBase}/api/projects/layouts/available`, {
    headers: getPluginHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch available layouts: ${res.statusText}`);
  }
  const json = await res.json();
  return json.success ? (json.data ?? []) : [];
}

export async function updateKnowledgeNamespace(
  projectSlug: string,
  namespaceId: string,
  data: Record<string, any>,
): Promise<any> {
  const apiBase = await _getApiBase();
  const res = await fetch(
    `${apiBase}/api/projects/${encodeURIComponent(projectSlug)}/knowledge/namespaces/${encodeURIComponent(namespaceId)}`,
    {
      method: 'PUT',
      headers: getPluginHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    },
  );
  if (!res.ok) throw new Error(`Failed to update namespace: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function fetchKnowledgeTree(
  projectSlug: string,
  namespace: string,
): Promise<any> {
  const apiBase = await _getApiBase();
  const res = await fetch(
    `${knowledgeBase(apiBase, projectSlug, namespace)}/tree`,
    { headers: getPluginHeaders() },
  );
  if (!res.ok) throw new Error(`Failed to fetch tree: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function fetchKnowledgeFiltered(
  projectSlug: string,
  namespace: string,
  filters: Record<string, any>,
): Promise<any[]> {
  const apiBase = await _getApiBase();
  const params = new URLSearchParams();
  if (filters.tags?.length) params.set('tags', filters.tags.join(','));
  if (filters.after) params.set('after', filters.after);
  if (filters.before) params.set('before', filters.before);
  if (filters.pathPrefix) params.set('pathPrefix', filters.pathPrefix);
  if (filters.status) params.set('status', filters.status);
  if (filters.metadata) {
    for (const [k, v] of Object.entries(filters.metadata)) {
      params.set(`metadata.${k}`, String(v));
    }
  }
  const qs = params.toString();
  const url = `${knowledgeBase(apiBase, projectSlug, namespace)}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    headers: getPluginHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch filtered docs: ${res.statusText}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function updateKnowledgeDoc(
  projectSlug: string,
  docId: string,
  updates: { content?: string; metadata?: Record<string, any> },
  namespace?: string,
): Promise<any> {
  const apiBase = await _getApiBase();
  const res = await fetch(
    `${knowledgeBase(apiBase, projectSlug, namespace)}/${encodeURIComponent(docId)}`,
    {
      method: 'PUT',
      headers: getPluginHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    },
  );
  if (!res.ok) throw new Error(`Failed to update doc: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}
