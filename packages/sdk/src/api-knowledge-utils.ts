import { _getApiBase, getPluginHeaders } from './api-core';

export function knowledgeBase(
  apiBase: string,
  projectSlug: string,
  namespace?: string,
): string {
  const base = `${apiBase}/api/projects/${encodeURIComponent(projectSlug)}/knowledge`;
  return namespace ? `${base}/ns/${encodeURIComponent(namespace)}` : base;
}

export async function requestKnowledgeJson<T>(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    errorPrefix: string;
    allowFailure?: boolean;
  },
): Promise<T> {
  const apiBase = await _getApiBase();
  const hasBody = options?.body !== undefined;
  const res = await fetch(`${apiBase}${path}`, {
    method: options?.method,
    headers: getPluginHeaders(
      hasBody ? { 'Content-Type': 'application/json' } : undefined,
    ),
    body: hasBody ? JSON.stringify(options?.body) : undefined,
  });

  if (!res.ok) {
    if (options?.allowFailure) {
      return [] as T;
    }
    throw new Error(`${options?.errorPrefix}: ${res.statusText}`);
  }

  const json = await res.json();
  if (!json.success) {
    if (options?.allowFailure) {
      return [] as T;
    }
    throw new Error(json.error);
  }

  return json.data as T;
}

export function buildKnowledgeFilterQuery(
  filters: Record<string, any>,
): string {
  const params = new URLSearchParams();
  if (filters.tags?.length) params.set('tags', filters.tags.join(','));
  if (filters.after) params.set('after', filters.after);
  if (filters.before) params.set('before', filters.before);
  if (filters.pathPrefix) params.set('pathPrefix', filters.pathPrefix);
  if (filters.status) params.set('status', filters.status);
  if (filters.metadata) {
    for (const [key, value] of Object.entries(filters.metadata)) {
      params.set(`metadata.${key}`, String(value));
    }
  }
  return params.toString();
}
