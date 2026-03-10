import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ChatLayoutConfig, LayoutConfig, ProjectConfig, WorkspaceConfig } from '@stallion-ai/shared';

export async function migrateWorkspacesToProject(projectHomeDir: string): Promise<void> {
  const stallionDir = join(projectHomeDir, '.stallion-ai');
  const projectsDir = join(stallionDir, 'projects');

  if (existsSync(projectsDir)) return;

  const workspacesDir = join(stallionDir, 'workspaces');
  const workspaces: WorkspaceConfig[] = [];

  if (existsSync(workspacesDir)) {
    for (const entry of readdirSync(workspacesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const wsFile = join(workspacesDir, entry.name, 'workspace.json');
      if (!existsSync(wsFile)) continue;
      try {
        workspaces.push(JSON.parse(readFileSync(wsFile, 'utf-8')));
      } catch {}
    }
  }

  const now = new Date().toISOString();
  const project: ProjectConfig = {
    id: randomUUID(),
    name: 'Default',
    slug: 'default',
    directories: [],
    createdAt: now,
    updatedAt: now,
  };

  const defaultProjectDir = join(projectsDir, 'default');
  const layoutsDir = join(defaultProjectDir, 'layouts');
  mkdirSync(layoutsDir, { recursive: true });

  writeFileSync(join(defaultProjectDir, 'project.json'), JSON.stringify(project, null, 2), 'utf-8');

  for (const ws of workspaces) {
    const chatConfig: ChatLayoutConfig = {
      tabs: ws.tabs,
      globalPrompts: ws.globalPrompts,
      defaultAgent: ws.defaultAgent,
      availableAgents: ws.availableAgents,
    };

    const layout: LayoutConfig = {
      id: randomUUID(),
      projectSlug: 'default',
      type: 'chat',
      name: ws.name,
      slug: ws.slug,
      icon: ws.icon,
      description: ws.description,
      config: chatConfig as unknown as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    };

    writeFileSync(
      join(layoutsDir, `${ws.slug}.json`),
      JSON.stringify(layout, null, 2),
      'utf-8',
    );
  }
}
