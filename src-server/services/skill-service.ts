/**
 * Agent Skills Service — discovers, indexes, and serves skills
 * following the Agent Skills open specification (agentskills.io).
 *
 * Progressive disclosure:
 *   Tier 1 (catalog): name + description injected into system prompt at startup
 *   Tier 2 (body):    full SKILL.md loaded on demand via activate_skill tool
 *   Tier 3 (resources): scripts/references/assets loaded when referenced
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import {
  extractResourceLinks,
  handleSkillRead,
  parseFrontmatter,
  parseSkillContent,
  type ResolvedSkill,
  type SkillResource,
  toDisclosureInstructions,
  toDisclosurePrompt,
  toReadToolSchema,
} from 'agent-skills-ts-sdk';
import type { ConfigLoader, SkillConfig } from '../domain/config-loader.js';
import {
  skillActivationDuration,
  skillActivations,
  skillDiscoveries,
  skillDiscoveryDuration,
  skillOps,
} from '../telemetry/metrics.js';

const SCRIPT_EXTS = new Set(['.py', '.sh', '.js', '.ts']);

export class SkillService {
  private registry = new Map<string, ResolvedSkill>();

  constructor(
    private configLoader: ConfigLoader,
    private logger: {
      info: (...a: any[]) => void;
      warn: (...a: any[]) => void;
      debug: (...a: any[]) => void;
    },
  ) {}

  // ── Discovery ──────────────────────────────────────────

  async discoverSkills(
    projectHomeDir: string,
    projectSlug?: string,
  ): Promise<void> {
    const start = Date.now();
    this.registry.clear();

    const dirs = [
      join(projectHomeDir, 'skills'),
      join(projectHomeDir, 'plugins'),
    ];
    if (projectSlug) {
      dirs.unshift(join(projectHomeDir, 'projects', projectSlug, 'skills'));
    }

    for (const dir of dirs) {
      if (!existsSync(dir)) continue;
      await this.scanDirectory(dir);
    }

    this.logger.info('Skills discovered', {
      count: this.registry.size,
      projectSlug,
    });
    skillDiscoveries.add(1, {
      count: this.registry.size,
      projectSlug: projectSlug || 'global',
    });
    skillDiscoveryDuration.record(Date.now() - start, {
      projectSlug: projectSlug || 'global',
    });
  }

  private async scanDirectory(dir: string, depth = 0): Promise<void> {
    if (depth > 4) return;
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name === '.git') continue;

      const skillMdPath = join(dir, entry.name, 'SKILL.md');
      if (existsSync(skillMdPath)) {
        try {
          const content = await readFile(skillMdPath, 'utf-8');
          const { properties, body } = parseSkillContent(content);

          const links = extractResourceLinks(body);
          const resources: SkillResource[] = [];
          for (const link of links) {
            const resourcePath = join(dir, entry.name, link.path);
            if (existsSync(resourcePath)) {
              resources.push({
                name: link.name,
                path: link.path,
                content: await readFile(resourcePath, 'utf-8'),
              });
            }
          }

          this.registry.set(properties.name, {
            name: properties.name,
            description: properties.description,
            body,
            resources,
            location: skillMdPath,
          });
        } catch (e) {
          this.logger.warn('Failed to parse skill', {
            path: skillMdPath,
            error: e,
          });
        }
      } else {
        await this.scanDirectory(join(dir, entry.name), depth + 1);
      }
    }
  }

  // ── Prompt Generation (Tier 1) ─────────────────────────

  getSkillCatalogPrompt(skillNames?: string[]): string {
    if (this.registry.size === 0) return '';
    if (skillNames !== undefined && skillNames.length === 0) return '';

    const allSkills = Array.from(this.registry.values());
    const filtered =
      skillNames !== undefined
        ? allSkills.filter((s) => skillNames.includes(s.name))
        : allSkills;
    if (filtered.length === 0) return '';

    const entries = filtered.map((s) => ({
      name: s.name,
      description: s.description,
      resources: s.resources.map((r) => r.name),
    }));

    const catalog = toDisclosurePrompt(entries);
    const instructions = toDisclosureInstructions({
      toolName: 'activate_skill',
    });
    return `${catalog}\n\n${instructions}`;
  }

  // ── Tool Definition (Tier 2 + 3) ───────────────────────

  getSkillTool(skillNames?: string[]): {
    name: string;
    description: string;
    parameters: object;
    execute: (input: any) => Promise<any>;
  } | null {
    const allSkills = Array.from(this.registry.values());
    const skills =
      skillNames !== undefined
        ? allSkills.filter((s) => skillNames.includes(s.name))
        : allSkills;
    if (skills.length === 0) return null;
    const schema = toReadToolSchema(skills, { toolName: 'activate_skill' });

    return {
      name: schema.name,
      description: schema.description,
      parameters: schema.parametersJsonSchema,
      execute: async (input: any) => {
        const start = Date.now();
        const result = handleSkillRead(skills, {
          name: input.name,
          resource: input.resource,
        });
        skillActivations.add(1, { skill: input.name || 'unknown' });
        skillActivationDuration.record(Date.now() - start, {
          skill: input.name || 'unknown',
        });
        if (!result.ok) return { error: (result as any).error };

        const skill = this.registry.get(input.name);
        if (skill && !input.resource) {
          const scriptTools = this.getScriptToolDefs(skill);
          const allowedTools = this.getAllowedTools(skill);
          return {
            content: (result as any).content,
            ...(scriptTools.length > 0 && { scriptTools }),
            ...(allowedTools && { allowedTools }),
          };
        }
        return { content: (result as any).content };
      },
    };
  }

  // ── CRUD (delegates to ConfigLoader) ───────────────────

  listSkills(): Array<{
    name: string;
    description: string;
    version?: string;
  }> {
    return Array.from(this.registry.values()).map((s) => {
      let version: string | undefined;
      if (s.location) {
        const metaPath = join(dirname(s.location), '.stallion-meta.json');
        if (existsSync(metaPath)) {
          try {
            version = JSON.parse(readFileSync(metaPath, 'utf-8')).version;
          } catch {}
        }
      }
      return { name: s.name, description: s.description, version };
    });
  }

  async getSkill(name: string): Promise<SkillConfig> {
    skillOps.add(1, { operation: 'get' });
    return this.configLoader.loadSkill(name);
  }

  async installSkill(
    name: string,
    projectHomeDir: string,
    projectSlug?: string,
  ): Promise<{ success: boolean; message: string }> {
    skillOps.add(1, { operation: 'install' });
    const { getSkillRegistryProviders } = await import(
      '../providers/registry.js'
    );
    const entries = getSkillRegistryProviders();
    if (entries.length === 0)
      return { success: false, message: 'No skill registry configured' };

    const targetDir = projectSlug
      ? join(projectHomeDir, 'projects', projectSlug, 'skills')
      : join(projectHomeDir, 'skills');

    await mkdir(targetDir, { recursive: true });

    for (const { provider } of entries) {
      const result = await provider.install(name, targetDir);
      if (result.success) {
        try {
          const items = await provider.listAvailable().catch(() => []);
          const item = items.find((i: any) => i.id === name);
          const version = item?.version ?? 'unknown';
          const skillDir = join(targetDir, name);
          await writeFile(
            join(skillDir, '.stallion-meta.json'),
            JSON.stringify({
              version,
              installedAt: new Date().toISOString(),
              source: 'registry',
            }),
          );
          // Write skill.json for ConfigLoader persistence
          await this.configLoader.saveSkill(name, {
            name,
            description: item?.description,
            source: 'registry',
            installedAt: new Date().toISOString(),
            version,
            path: skillDir,
          });
        } catch {}
        await this.discoverSkills(projectHomeDir, projectSlug);
        return result;
      }
    }

    return {
      success: false,
      message: `No skill registry provider could install ${name}`,
    };
  }

  async removeSkill(
    name: string,
    projectHomeDir: string,
    projectSlug?: string,
  ): Promise<{ success: boolean; message: string }> {
    skillOps.add(1, { operation: 'remove' });
    const targetDir = projectSlug
      ? join(projectHomeDir, 'projects', projectSlug, 'skills', name)
      : join(projectHomeDir, 'skills', name);

    if (!existsSync(targetDir))
      return { success: false, message: `Skill '${name}' not found` };

    await rm(targetDir, { recursive: true, force: true });
    await this.discoverSkills(projectHomeDir, projectSlug);
    return { success: true, message: `Removed ${name}` };
  }

  getSkillCount(): number {
    return this.registry.size;
  }

  // ── Private helpers ────────────────────────────────────

  private getScriptToolDefs(
    skill: ResolvedSkill,
  ): Array<{ name: string; description: string; path: string }> {
    return skill.resources
      .filter(
        (r) =>
          r.path.startsWith('scripts/') && SCRIPT_EXTS.has(extname(r.path)),
      )
      .map((r) => ({
        name: `${skill.name}/${r.name}`,
        description: `Script from ${skill.name} skill: ${r.name}`,
        path: r.path,
      }));
  }

  private getAllowedTools(skill: ResolvedSkill): string | undefined {
    const location = skill.location;
    if (!location || !existsSync(location)) return undefined;
    try {
      const content = readFileSync(location, 'utf-8');
      const { metadata } = parseFrontmatter(content);
      return metadata['allowed-tools'] || undefined;
    } catch (e) {
      this.logger.debug('Failed to parse skill frontmatter for allowed-tools', {
        location,
        error: e,
      });
      return undefined;
    }
  }
}
