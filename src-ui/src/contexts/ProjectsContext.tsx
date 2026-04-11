import { useProjectQuery, useProjectsQuery } from '@stallion-ai/sdk';
import { type ReactNode } from 'react';

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

export interface ProjectConfig extends ProjectMetadata {
  workingDirectory?: string;
  defaultModel?: string;
  defaultEmbeddingProviderId?: string;
  defaultEmbeddingModel?: string;
  similarityThreshold?: number;
  topK?: number;
  agents?: string[];
  createdAt: string;
  updatedAt: string;
}

// Provider is a no-op wrapper — data is fetched via hooks using React Query
export function ProjectsProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useProjects(): {
  projects: ProjectMetadata[];
  isLoading: boolean;
} {
  const { data, isLoading } = useProjectsQuery();
  return { projects: data ?? [], isLoading };
}

export function useProject(slug: string): {
  project: ProjectConfig | undefined;
  isLoading: boolean;
} {
  const { data, isLoading } = useProjectQuery(slug, { enabled: !!slug });
  return { project: data, isLoading };
}
