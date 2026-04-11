import type { KnowledgeNamespaceConfig } from './knowledge.js';

export interface ProjectConfig {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  workingDirectory?: string;
  defaultProviderId?: string;
  defaultModel?: string;
  defaultEmbeddingProviderId?: string;
  defaultEmbeddingModel?: string;
  similarityThreshold?: number;
  topK?: number;
  agents?: string[];
  knowledgeNamespaces?: KnowledgeNamespaceConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMetadata {
  id: string;
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  hasWorkingDirectory: boolean;
  workingDirectory?: string;
  layoutCount: number;
  hasKnowledge: boolean;
  defaultProviderId?: string;
}
