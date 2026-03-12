import { useQuery } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useApiBase } from './ApiBaseContext';

export interface ProjectMetadata {
  id: string;
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  hasWorkingDirectory: boolean;
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
  const { apiBase } = useApiBase();
  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/projects`);
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      return result.data as ProjectMetadata[];
    },
  });
  return { projects: data ?? [], isLoading };
}

export function useProject(slug: string): {
  project: ProjectConfig | undefined;
  isLoading: boolean;
} {
  const { apiBase } = useApiBase();
  const { data, isLoading } = useQuery({
    queryKey: ['projects', slug],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/projects/${slug}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      return result.data as ProjectConfig;
    },
    enabled: !!slug,
  });
  return { project: data, isLoading };
}
