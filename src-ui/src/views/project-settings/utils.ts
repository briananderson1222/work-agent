import type { ProjectConfig } from '../../contexts/ProjectsContext';
import type { ProjectForm } from './types';

export function buildProjectForm(project: ProjectConfig): ProjectForm {
  return {
    name: project.name,
    icon: project.icon ?? '',
    description: project.description ?? '',
    defaultModel: project.defaultModel ?? '',
    workingDirectory: project.workingDirectory ?? '',
    agents: project.agents ?? [],
  };
}

export function getKnowledgeTimeAgo(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
