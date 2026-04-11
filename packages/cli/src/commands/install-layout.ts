import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';

interface LayoutConfig {
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  tabs?: unknown[];
  actions?: unknown[];
  globalPrompts?: unknown[];
  defaultAgent?: string;
  availableAgents?: string[];
  requiredProviders?: string[];
}

export function applyInstalledPluginLayout(params: {
  finalDir: string;
  manifest: PluginManifest;
  projectHome: string;
  skipSet: Set<string>;
  projectArgv?: string[];
}): void {
  const { finalDir, manifest, projectHome, skipSet, projectArgv = process.argv } =
    params;
  if (!manifest.layout || skipSet.has(`layout:${manifest.layout.slug}`)) {
    return;
  }

  const sourcePath = join(finalDir, manifest.layout.source);
  if (!existsSync(sourcePath)) {
    return;
  }

  const layoutConfig = JSON.parse(
    readFileSync(sourcePath, 'utf-8'),
  ) as LayoutConfig;
  console.log(`  ✓ Layout available: ${manifest.layout.slug}`);

  const projectsDir = join(projectHome, 'projects');
  if (!existsSync(projectsDir)) {
    return;
  }

  const projectSlugs = readdirSync(projectsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(projectsDir, entry.name, 'project.json')),
    )
    .map((entry) => entry.name);

  let targetProject = projectSlugs.length === 1 ? projectSlugs[0] : null;
  const projectFlag = projectArgv.find((arg) => arg.startsWith('--project='));
  if (projectFlag) targetProject = projectFlag.split('=')[1];

  if (!targetProject) {
    if (projectSlugs.length > 1) {
      console.log(
        '  ℹ Multiple projects found. Use --project=<slug> to apply layout, or add via UI.',
      );
      console.log(`    Projects: ${projectSlugs.join(', ')}`);
    }
    return;
  }

  const layoutsDir = join(projectsDir, targetProject, 'layouts');
  mkdirSync(layoutsDir, { recursive: true });
  const existing =
    existsSync(layoutsDir) &&
    readdirSync(layoutsDir).some((filename) => {
      try {
        return (
          JSON.parse(readFileSync(join(layoutsDir, filename), 'utf-8')).slug ===
          layoutConfig.slug
        );
      } catch {
        return false;
      }
    });
  if (existing) {
    return;
  }

  const layout = {
    id: crypto.randomUUID(),
    projectSlug: targetProject,
    type: 'chat',
    name: layoutConfig.name,
    slug: layoutConfig.slug,
    icon: layoutConfig.icon,
    description: layoutConfig.description,
    config: {
      plugin: manifest.name,
      tabs: layoutConfig.tabs,
      globalPrompts: layoutConfig.actions ?? layoutConfig.globalPrompts,
      defaultAgent: layoutConfig.defaultAgent,
      availableAgents: layoutConfig.availableAgents,
      requiredProviders: layoutConfig.requiredProviders,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(
    join(layoutsDir, `${layoutConfig.slug}.json`),
    JSON.stringify(layout, null, 2),
  );
  console.log(`  ✓ Layout applied to project: ${targetProject}`);
}
