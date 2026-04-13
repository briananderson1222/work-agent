import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ACPConfig } from '@stallion-ai/contracts/acp';
import type { ToolDef, ToolMetadata } from '@stallion-ai/contracts/tool';

export interface SkillConfigRecord {
  name: string;
  description?: string;
  source: 'local' | 'registry' | 'plugin';
  installedAt: string;
  version?: string;
  path: string;
  body?: string;
  tags?: string[];
  category?: string;
  agent?: string;
  global?: boolean;
}

export async function loadIntegrationConfig(
  projectHomeDir: string,
  id: string,
): Promise<ToolDef> {
  const path = join(projectHomeDir, 'integrations', id, 'integration.json');

  if (!existsSync(path)) {
    throw new Error(`Tool '${id}' not found at ${path}`);
  }

  return JSON.parse(await readFile(path, 'utf-8'));
}

export async function saveIntegrationConfig(
  projectHomeDir: string,
  id: string,
  def: ToolDef,
): Promise<void> {
  const integrationDir = join(projectHomeDir, 'integrations', id);
  await mkdir(integrationDir, { recursive: true });
  await writeFile(
    join(integrationDir, 'integration.json'),
    JSON.stringify(def, null, 2),
    'utf-8',
  );
}

export async function deleteIntegrationConfig(
  projectHomeDir: string,
  id: string,
): Promise<void> {
  const integrationDir = join(projectHomeDir, 'integrations', id);
  if (existsSync(integrationDir)) {
    await rm(integrationDir, { recursive: true, force: true });
  }
}

export async function listIntegrationMetadata(
  projectHomeDir: string,
  logger: {
    error: (message: string, fields?: Record<string, unknown>) => void;
  },
): Promise<ToolMetadata[]> {
  const integrationsDir = join(projectHomeDir, 'integrations');
  if (!existsSync(integrationsDir)) {
    return [];
  }

  const entries = await readdir(integrationsDir, { withFileTypes: true });
  const tools: ToolMetadata[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const integrationPath = join(
      integrationsDir,
      entry.name,
      'integration.json',
    );
    if (!existsSync(integrationPath)) continue;

    try {
      const def = await loadIntegrationConfig(projectHomeDir, entry.name);
      tools.push({
        id: def.id,
        kind: def.kind,
        displayName: def.displayName,
        description: def.description,
        transport: def.transport,
        source: def.command || def.endpoint,
      });
    } catch (error) {
      logger.error('Failed to load tool', { tool: entry.name, error });
    }
  }

  return tools;
}

export async function listSkillConfigs(
  projectHomeDir: string,
  logger: { warn: (message: string, fields?: Record<string, unknown>) => void },
): Promise<SkillConfigRecord[]> {
  const dir = join(projectHomeDir, 'skills');
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const results: SkillConfigRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const cfgPath = join(dir, entry.name, 'skill.json');
    if (!existsSync(cfgPath)) continue;
    try {
      results.push(JSON.parse(await readFile(cfgPath, 'utf-8')));
    } catch {
      logger.warn('Failed to read skill config', { path: cfgPath });
    }
  }
  return results;
}

export async function loadSkillConfig(
  projectHomeDir: string,
  name: string,
): Promise<SkillConfigRecord> {
  const path = join(projectHomeDir, 'skills', name, 'skill.json');
  if (!existsSync(path)) throw new Error(`Skill '${name}' not found`);
  return JSON.parse(await readFile(path, 'utf-8'));
}

export async function saveSkillConfig(
  projectHomeDir: string,
  name: string,
  config: SkillConfigRecord,
): Promise<void> {
  const dir = join(projectHomeDir, 'skills', name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'skill.json'),
    JSON.stringify(config, null, 2),
    'utf-8',
  );
}

export async function deleteSkillConfig(
  projectHomeDir: string,
  name: string,
): Promise<void> {
  const dir = join(projectHomeDir, 'skills', name);
  if (!existsSync(dir)) throw new Error(`Skill '${name}' not found`);
  await rm(dir, { recursive: true, force: true });
}

export function skillConfigExists(
  projectHomeDir: string,
  name: string,
): boolean {
  return existsSync(join(projectHomeDir, 'skills', name, 'skill.json'));
}

export async function loadACPConfigFile(
  projectHomeDir: string,
): Promise<ACPConfig> {
  const path = join(projectHomeDir, 'config', 'acp.json');
  if (!existsSync(path)) return { connections: [] };
  return JSON.parse(await readFile(path, 'utf-8'));
}

export async function saveACPConfigFile(
  projectHomeDir: string,
  config: ACPConfig,
): Promise<void> {
  const path = join(projectHomeDir, 'config', 'acp.json');
  await mkdir(join(projectHomeDir, 'config'), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2), 'utf-8');
}
