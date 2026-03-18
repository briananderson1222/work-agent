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
import { FileStorageAdapter } from './file-storage-adapter.js';

export async function runStartupMigrations(projectHomeDir: string): Promise<void> {
  // Seed default provider connections (runs every startup, idempotent)
  const storageAdapter = new FileStorageAdapter(projectHomeDir);
  const existing = storageAdapter.listProviderConnections();
  if (!existing.some(c => c.capabilities.includes('vectordb'))) {
    storageAdapter.saveProviderConnection({
      id: 'lancedb-builtin',
      type: 'lancedb',
      name: 'LanceDB (built-in)',
      config: { dataDir: `${projectHomeDir}/vectordb` },
      enabled: true,
      capabilities: ['vectordb'] as ('llm' | 'embedding' | 'vectordb')[],
    });
  }
  if (!existing.some(c => c.capabilities.includes('llm'))) {
    storageAdapter.saveProviderConnection({
      id: 'bedrock-default',
      type: 'bedrock',
      name: 'Amazon Bedrock',
      config: { region: '' },
      enabled: true,
      capabilities: ['llm', 'embedding'] as ('llm' | 'embedding' | 'vectordb')[],
    });
  }

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
      } catch (e) { console.debug('Failed to parse layout file during migration:', layoutFile, e); }
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