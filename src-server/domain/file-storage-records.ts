import type {
  ConversationRecord,
  DocumentRecord,
  LayoutAgentReference,
} from './storage-adapter.js';
import {
  listProjectSlugs,
  readJsonFile,
  resolveProjectSlugById,
  writeJsonFile,
} from './file-storage-helpers.js';

export function listStoredRecords<T>(
  path: string,
  fallback: T[] = [],
): T[] {
  return readJsonFile(path, fallback);
}

export function saveStoredRecord<T extends { id: string }>(
  path: string,
  record: T,
): void {
  const records = listStoredRecords<T>(path);
  const index = records.findIndex((entry) => entry.id === record.id);
  if (index >= 0) records[index] = record;
  else records.push(record);
  writeJsonFile(path, records);
}

export function deleteStoredRecord<T extends { id: string }>(
  path: string,
  id: string,
): boolean {
  const records = listStoredRecords<T>(path);
  const index = records.findIndex((entry) => entry.id === id);
  if (index < 0) return false;
  records.splice(index, 1);
  writeJsonFile(path, records);
  return true;
}

export function findStoredRecordAcrossProjects<T extends { id: string }>(
  projectHomeDir: string,
  resolvePath: (projectSlug: string) => string,
  id: string,
): T | null {
  for (const slug of listProjectSlugs(projectHomeDir)) {
    const found = listStoredRecords<T>(resolvePath(slug)).find(
      (record) => record.id === id,
    );
    if (found) return found;
  }
  return null;
}

export function saveProjectScopedRecord<T extends { id: string; projectId: string }>(
  projectHomeDir: string,
  resolvePath: (projectSlug: string) => string,
  record: T,
): void {
  const projectSlug = resolveProjectSlugById(projectHomeDir, record.projectId);
  saveStoredRecord(resolvePath(projectSlug), record);
}

export function deleteProjectScopedRecord<T extends { id: string }>(
  projectHomeDir: string,
  resolvePath: (projectSlug: string) => string,
  id: string,
): boolean {
  for (const slug of listProjectSlugs(projectHomeDir)) {
    if (deleteStoredRecord<T>(resolvePath(slug), id)) {
      return true;
    }
  }
  return false;
}

export function listSortedConversations(
  path: string,
  opts?: { limit?: number; offset?: number },
): ConversationRecord[] {
  let records = listStoredRecords<ConversationRecord>(path);
  records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  if (opts?.offset) records = records.slice(opts.offset);
  if (opts?.limit) records = records.slice(0, opts.limit);
  return records;
}

export function buildLayoutAgentReferences(
  projects: Array<{ slug: string }>,
  listLayouts: (projectSlug: string) => Array<{ slug: string }>,
  getLayoutConfig: (projectSlug: string, layoutSlug: string) => any,
  agentSlug: string,
): LayoutAgentReference[] {
  const references: LayoutAgentReference[] = [];

  for (const project of projects) {
    for (const layout of listLayouts(project.slug)) {
      const config = getLayoutConfig(project.slug, layout.slug).config as {
        tabs?: Array<{
          prompts?: Array<{ agent?: string }>;
          actions?: Array<{ agent?: string }>;
        }>;
        globalPrompts?: Array<{ agent?: string }>;
        actions?: Array<{ agent?: string }>;
        defaultAgent?: string;
        availableAgents?: string[];
      };

      const tabs = config.tabs ?? [];
      const isReferencedInTabs = tabs.some(
        (tab) =>
          (tab.prompts ?? []).some((prompt) => prompt.agent === agentSlug) ||
          (tab.actions ?? []).some((action) => action.agent === agentSlug),
      );
      const isReferencedGlobally =
        (config.globalPrompts ?? []).some(
          (prompt) => prompt.agent === agentSlug,
        ) ||
        (config.actions ?? []).some((action) => action.agent === agentSlug);
      const isConfiguredAgent =
        config.defaultAgent === agentSlug ||
        (config.availableAgents ?? []).includes(agentSlug);

      if (isReferencedInTabs || isReferencedGlobally || isConfiguredAgent) {
        references.push({
          projectSlug: project.slug,
          layoutSlug: layout.slug,
        });
      }
    }
  }

  return references;
}

export type { ConversationRecord, DocumentRecord };
