import { randomUUID } from 'node:crypto';
import type { ProjectConfig, ProjectMetadata } from '@stallion-ai/shared';
import type { IStorageAdapter } from '../domain/storage-adapter.js';
import { projectOps } from '../telemetry/metrics.js';

export class ProjectService {
  constructor(private storageAdapter: IStorageAdapter) {}

  listProjects(): ProjectMetadata[] {
    return this.storageAdapter.listProjects();
  }

  getProject(slug: string): ProjectConfig {
    return this.storageAdapter.getProject(slug);
  }

  async createProject(config: Omit<ProjectConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectConfig> {
    const now = new Date().toISOString();
    const project: ProjectConfig = {
      ...config,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await this.storageAdapter.saveProject(project);
    projectOps.add(1, { op: 'create' });
    return project;
  }

  async updateProject(slug: string, updates: Partial<Omit<ProjectConfig, 'id' | 'slug' | 'createdAt'>>): Promise<ProjectConfig> {
    const existing = await this.storageAdapter.getProject(slug);
    const updated: ProjectConfig = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.storageAdapter.saveProject(updated);
    projectOps.add(1, { op: 'update' });
    return updated;
  }

  deleteProject(slug: string): void {
    this.storageAdapter.deleteProject(slug);
    projectOps.add(1, { op: 'delete' });
  }
}
