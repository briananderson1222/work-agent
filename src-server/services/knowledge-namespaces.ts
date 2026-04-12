import {
  BUILTIN_KNOWLEDGE_NAMESPACES,
  type KnowledgeNamespaceConfig,
} from '@stallion-ai/contracts/knowledge';
import type { IStorageAdapter } from '../domain/storage-adapter.js';
import { defaultKnowledgeStorageDir } from './knowledge-storage.js';

export function listKnowledgeNamespaces(
  projectSlug: string,
  storageAdapter?: IStorageAdapter,
): KnowledgeNamespaceConfig[] {
  if (!storageAdapter) return [...BUILTIN_KNOWLEDGE_NAMESPACES];
  try {
    const project = storageAdapter.getProject(projectSlug);
    const custom = project.knowledgeNamespaces ?? [];
    const seen = new Set<string>();
    const result: KnowledgeNamespaceConfig[] = [];
    for (const namespace of [...BUILTIN_KNOWLEDGE_NAMESPACES, ...custom]) {
      if (!seen.has(namespace.id)) {
        seen.add(namespace.id);
        result.push(namespace);
      }
    }
    return result;
  } catch {
    return [...BUILTIN_KNOWLEDGE_NAMESPACES];
  }
}

export function getKnowledgeNamespaceConfig(
  projectSlug: string,
  namespaceId: string,
  storageAdapter?: IStorageAdapter,
) {
  return listKnowledgeNamespaces(projectSlug, storageAdapter).find(
    (namespace) => namespace.id === namespaceId,
  );
}

export function resolveKnowledgeStorageDir(
  projectSlug: string,
  namespaceId: string,
  dataDir: string,
  storageAdapter?: IStorageAdapter,
) {
  const namespace = getKnowledgeNamespaceConfig(
    projectSlug,
    namespaceId,
    storageAdapter,
  );
  if (namespace?.storageDir) return namespace.storageDir;
  return defaultKnowledgeStorageDir(dataDir, projectSlug, namespaceId);
}

export function registerKnowledgeNamespace(
  projectSlug: string,
  namespace: KnowledgeNamespaceConfig,
  storageAdapter?: IStorageAdapter,
): void {
  if (!storageAdapter) throw new Error('Storage adapter required');
  const project = storageAdapter.getProject(projectSlug);
  const existing = project.knowledgeNamespaces ?? [];
  if (existing.some((entry) => entry.id === namespace.id)) return;
  project.knowledgeNamespaces = [...existing, namespace];
  project.updatedAt = new Date().toISOString();
  storageAdapter.saveProject(project);
}

export function removeKnowledgeNamespace(
  projectSlug: string,
  namespaceId: string,
  storageAdapter?: IStorageAdapter,
): void {
  if (!storageAdapter) throw new Error('Storage adapter required');
  if (
    BUILTIN_KNOWLEDGE_NAMESPACES.some(
      (namespace) => namespace.id === namespaceId,
    )
  ) {
    throw new Error(`Cannot remove built-in namespace '${namespaceId}'`);
  }
  const project = storageAdapter.getProject(projectSlug);
  project.knowledgeNamespaces = (project.knowledgeNamespaces ?? []).filter(
    (namespace) => namespace.id !== namespaceId,
  );
  project.updatedAt = new Date().toISOString();
  storageAdapter.saveProject(project);
}

export function updateKnowledgeNamespace(
  projectSlug: string,
  namespaceId: string,
  updates: Partial<KnowledgeNamespaceConfig>,
  storageAdapter?: IStorageAdapter,
): void {
  if (!storageAdapter) throw new Error('Storage adapter required');
  const project = storageAdapter.getProject(projectSlug);
  const namespaces = project.knowledgeNamespaces ?? [];
  const index = namespaces.findIndex(
    (namespace) => namespace.id === namespaceId,
  );

  if (index >= 0) {
    namespaces[index] = { ...namespaces[index], ...updates, id: namespaceId };
  } else {
    const builtin = BUILTIN_KNOWLEDGE_NAMESPACES.find(
      (namespace) => namespace.id === namespaceId,
    );
    if (!builtin) {
      throw new Error(`Namespace '${namespaceId}' not found`);
    }
    namespaces.push({ ...builtin, ...updates, id: namespaceId });
  }

  project.knowledgeNamespaces = namespaces;
  project.updatedAt = new Date().toISOString();
  storageAdapter.saveProject(project);
}
