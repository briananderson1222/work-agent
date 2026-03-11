import { useMemo } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import { useProjects } from '../contexts/ProjectsContext';

/**
 * useActiveProject — single source of truth for the active project context.
 *
 * Resolution order:
 *   1. URL path (/projects/:slug/...) via selectedProject
 *   2. localStorage lastProject (persisted across navigations)
 *   3. null (no project context)
 */
export function useActiveProject(): {
  projectSlug: string | null;
  projectName: string | null;
} {
  const { selectedProject, lastProject } = useNavigation();
  const { projects } = useProjects();

  return useMemo(() => {
    const slug = selectedProject || lastProject || null;
    if (!slug) return { projectSlug: null, projectName: null };
    const name = projects.find((p: any) => p.slug === slug)?.name ?? slug;
    return { projectSlug: slug, projectName: name };
  }, [selectedProject, lastProject, projects]);
}
