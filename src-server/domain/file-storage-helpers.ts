import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { ProjectConfig } from '@stallion-ai/contracts/project';

export function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

export function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8');
}

export function listProjectSlugs(projectHomeDir: string): string[] {
  const dir = join(projectHomeDir, 'projects');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export function resolveProjectSlugById(
  projectHomeDir: string,
  projectId: string,
): string {
  for (const slug of listProjectSlugs(projectHomeDir)) {
    const projectPath = join(projectHomeDir, 'projects', slug, 'project.json');
    if (!existsSync(projectPath)) continue;
    const project = JSON.parse(readFileSync(projectPath, 'utf-8')) as Pick<
      ProjectConfig,
      'id'
    >;
    if (project.id === projectId) {
      return slug;
    }
  }
  throw new Error(`Project not found for id: ${projectId}`);
}
