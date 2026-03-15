import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type {
  LayoutConfig,
  ProjectConfig,
  StandaloneLayoutConfig,
} from '@stallion-ai/shared';

export async function migrateToProject(projectHomeDir: string): Promise<void> {
  const projectsDir = join(projectHomeDir, 'projects');

  if (existsSync(projectsDir)) return;

  const layoutsDir = join(projectHomeDir, 'layouts');
  const standaloneLayouts: StandaloneLayoutConfig[] = [];

  if (existsSync(layoutsDir)) {
    for (const entry of readdirSync(layoutsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const layoutFile = join(layoutsDir, entry.name, 'layout.json');
      if (!existsSync(layoutFile)) continue;
      try {
        standaloneLayouts.push(JSON.parse(readFileSync(layoutFile, 'utf-8')));
      } catch {}
    }
  }

  const now = new Date().toISOString();
  const project: ProjectConfig = {
    id: randomUUID(),
    name: 'Default',
    slug: 'default',
    createdAt: now,
    updatedAt: now,
  };

  const defaultProjectDir = join(projectsDir, 'default');
  const projectLayoutsDir = join(defaultProjectDir, 'layouts');
  mkdirSync(projectLayoutsDir, { recursive: true });

  writeFileSync(
    join(defaultProjectDir, 'project.json'),
    JSON.stringify(project, null, 2),
    'utf-8',
  );

  for (const sl of standaloneLayouts) {
    const layout: LayoutConfig = {
      id: randomUUID(),
      projectSlug: 'default',
      type: 'chat',
      name: sl.name,
      slug: sl.slug,
      icon: sl.icon,
      description: sl.description,
      config: {
        tabs: sl.tabs,
        globalPrompts: sl.globalPrompts,
        defaultAgent: sl.defaultAgent,
        availableAgents: sl.availableAgents,
      },
      createdAt: now,
      updatedAt: now,
    };

    writeFileSync(
      join(projectLayoutsDir, `${sl.slug}.json`),
      JSON.stringify(layout, null, 2),
      'utf-8',
    );
  }
}
