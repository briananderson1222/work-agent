import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SkillConfig } from '../domain/config-loader.js';
import type { ISkillRegistryProvider } from '../providers/provider-interfaces.js';

interface SkillInstallConfigLoader {
  saveSkill: (name: string, config: SkillConfig) => Promise<void>;
}

interface InstallSkillDeps {
  name: string;
  projectHomeDir: string;
  projectSlug?: string;
  configLoader: SkillInstallConfigLoader;
  providers: Array<{ provider: ISkillRegistryProvider }>;
  rediscover: () => Promise<void>;
}

interface RemoveSkillDeps {
  name: string;
  projectHomeDir: string;
  projectSlug?: string;
  rediscover: () => Promise<void>;
}

function getSkillTargetDir(
  projectHomeDir: string,
  projectSlug?: string,
): string {
  return projectSlug
    ? join(projectHomeDir, 'projects', projectSlug, 'skills')
    : join(projectHomeDir, 'skills');
}

export async function installSkillFromRegistry({
  name,
  projectHomeDir,
  projectSlug,
  configLoader,
  providers,
  rediscover,
}: InstallSkillDeps): Promise<{ success: boolean; message: string }> {
  if (providers.length === 0) {
    return { success: false, message: 'No skill registry configured' };
  }

  const targetDir = getSkillTargetDir(projectHomeDir, projectSlug);
  await mkdir(targetDir, { recursive: true });

  for (const { provider } of providers) {
    const result = await provider.install(name, targetDir);
    if (!result.success) continue;

    try {
      const items = await provider.listAvailable().catch(() => []);
      const item = items.find((entry) => entry.id === name);
      const version = item?.version ?? 'unknown';
      const skillDir = join(targetDir, name);
      const installedAt = new Date().toISOString();
      await writeFile(
        join(skillDir, '.stallion-meta.json'),
        JSON.stringify(
          {
            version,
            installedAt,
            source: 'registry',
          },
          null,
          2,
        ),
      );
      await configLoader.saveSkill(name, {
        name,
        description: item?.description,
        source: 'registry',
        installedAt,
        version,
        path: skillDir,
      });
    } catch {}

    await rediscover();
    return result;
  }

  return {
    success: false,
    message: `No skill registry provider could install ${name}`,
  };
}

export async function removeInstalledSkill({
  name,
  projectHomeDir,
  projectSlug,
  rediscover,
}: RemoveSkillDeps): Promise<{ success: boolean; message: string }> {
  const targetDir = join(getSkillTargetDir(projectHomeDir, projectSlug), name);
  if (!existsSync(targetDir)) {
    return { success: false, message: `Skill '${name}' not found` };
  }

  await rm(targetDir, { recursive: true, force: true });
  await rediscover();
  return { success: true, message: `Removed ${name}` };
}
