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
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import type { GuidanceAsset } from '@stallion-ai/contracts/catalog';
import { skillToGuidanceAsset } from '@stallion-ai/contracts/guidance-assets';
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
import {
  installSkillFromRegistry,
  removeInstalledSkill,
} from './skill-service-install.js';

const SCRIPT_EXTS = new Set(['.py', '.sh', '.js', '.ts']);

interface EditableSkillInput {
  name: string;
  description?: string;
  body: string;
  tags?: string[];
  category?: string;
  agent?: string;
  global?: boolean;
}

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
    source?: string;
    path?: string;
    installed?: boolean;
  }> {
    return Array.from(this.registry.values()).map((s) => {
      let version: string | undefined;
      let source: string | undefined;
      let path: string | undefined;
      if (s.location) {
        const metaPath = join(dirname(s.location), '.stallion-meta.json');
        if (existsSync(metaPath)) {
          try {
            version = JSON.parse(readFileSync(metaPath, 'utf-8')).version;
          } catch {}
        }
        const skillJsonPath = join(dirname(s.location), 'skill.json');
        if (existsSync(skillJsonPath)) {
          try {
            const config = JSON.parse(readFileSync(skillJsonPath, 'utf-8'));
            source = config.source;
            path = config.path;
            version = config.version ?? version;
          } catch {}
        }
      }
      return {
        name: s.name,
        description: s.description,
        version,
        source,
        path,
        installed: true,
      };
    });
  }

  listGuidanceAssets(): GuidanceAsset[] {
    return Array.from(this.registry.values()).map((skill) =>
      skillToGuidanceAsset({
        id: skill.name,
        name: skill.name,
        description: skill.description,
        installed: true,
        installedVersion: (() => {
          if (!skill.location) return undefined;
          const metaPath = join(dirname(skill.location), '.stallion-meta.json');
          if (!existsSync(metaPath)) return undefined;
          try {
            return JSON.parse(readFileSync(metaPath, 'utf-8')).version;
          } catch {
            return undefined;
          }
        })(),
        body: skill.body,
        path: skill.location ? dirname(skill.location) : undefined,
        resources: skill.resources.map((resource) => ({
          name: resource.name,
          path: resource.path,
        })),
        scripts: skill.resources
          .filter((resource) => {
            const ext = extname(resource.path);
            return SCRIPT_EXTS.has(ext);
          })
          .map((resource) => ({
            name: resource.name,
            path: resource.path,
          })),
      }),
    );
  }

  async getSkill(name: string): Promise<SkillConfig> {
    skillOps.add(1, { operation: 'get' });
    const config = await this.configLoader.loadSkill(name);
    const skillPath = join(config.path, 'SKILL.md');
    if (!existsSync(skillPath)) {
      return config;
    }

    try {
      const content = await readFile(skillPath, 'utf-8');
      const { properties, body } = parseSkillContent(content);
      const { metadata } = parseFrontmatter(content);
      const frontmatter = metadata as unknown as Record<string, unknown>;
      return {
        ...config,
        body,
        description: properties.description ?? config.description,
        tags: Array.isArray(frontmatter.tags)
          ? (frontmatter.tags as string[])
          : config.tags,
        category:
          typeof frontmatter.category === 'string'
            ? frontmatter.category
            : config.category,
        agent:
          typeof frontmatter.agent === 'string'
            ? frontmatter.agent
            : config.agent,
        global:
          typeof frontmatter.global === 'boolean'
            ? frontmatter.global
            : config.global,
      };
    } catch {
      return config;
    }
  }

  async createLocalSkill(
    input: EditableSkillInput,
    projectHomeDir: string,
    projectSlug?: string,
  ): Promise<{ success: boolean; message: string }> {
    const skillDir = this.resolveSkillDir(
      projectHomeDir,
      input.name,
      projectSlug,
    );
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      this.serializeSkillMarkdown(input),
      'utf-8',
    );
    await this.configLoader.saveSkill(input.name, {
      name: input.name,
      description: input.description,
      source: 'local',
      installedAt: new Date().toISOString(),
      path: skillDir,
      body: input.body,
      tags: input.tags,
      category: input.category,
      agent: input.agent,
      global: input.global,
    });
    await this.discoverSkills(projectHomeDir, projectSlug);
    return { success: true, message: `Created ${input.name}` };
  }

  async updateLocalSkill(
    name: string,
    updates: Partial<EditableSkillInput>,
    projectHomeDir: string,
    projectSlug?: string,
  ): Promise<{ success: boolean; message: string }> {
    const current = await this.getSkill(name);
    const next: EditableSkillInput = {
      name: updates.name ?? current.name,
      description: updates.description ?? current.description,
      body: updates.body ?? current.body ?? '',
      tags: updates.tags ?? current.tags,
      category: updates.category ?? current.category,
      agent: updates.agent ?? current.agent,
      global: updates.global ?? current.global,
    };
    const skillDir = this.resolveSkillDir(projectHomeDir, name, projectSlug);
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      this.serializeSkillMarkdown(next),
      'utf-8',
    );
    await this.configLoader.saveSkill(next.name, {
      ...current,
      name: next.name,
      description: next.description,
      source: 'local',
      path: skillDir,
      body: next.body,
      tags: next.tags,
      category: next.category,
      agent: next.agent,
      global: next.global,
    });
    await this.discoverSkills(projectHomeDir, projectSlug);
    return { success: true, message: `Updated ${next.name}` };
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
    return installSkillFromRegistry({
      name,
      projectHomeDir,
      projectSlug,
      configLoader: this.configLoader,
      providers: getSkillRegistryProviders(),
      rediscover: async () => this.discoverSkills(projectHomeDir, projectSlug),
    });
  }

  async removeSkill(
    name: string,
    projectHomeDir: string,
    projectSlug?: string,
  ): Promise<{ success: boolean; message: string }> {
    skillOps.add(1, { operation: 'remove' });
    return removeInstalledSkill({
      name,
      projectHomeDir,
      projectSlug,
      rediscover: async () => this.discoverSkills(projectHomeDir, projectSlug),
    });
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

  private resolveSkillDir(
    projectHomeDir: string,
    name: string,
    projectSlug?: string,
  ) {
    return projectSlug
      ? join(projectHomeDir, 'projects', projectSlug, 'skills', name)
      : join(projectHomeDir, 'skills', name);
  }

  private serializeSkillMarkdown(input: EditableSkillInput): string {
    const parts = ['---', `name: ${input.name}`];
    if (input.description) parts.push(`description: ${input.description}`);
    if (input.category) parts.push(`category: ${input.category}`);
    if (input.tags?.length) {
      parts.push('tags:');
      for (const tag of input.tags) parts.push(`  - ${tag}`);
    }
    if (input.agent) parts.push(`agent: ${input.agent}`);
    if (input.global) parts.push('global: true');
    parts.push('---', '', input.body);
    return parts.join('\n');
  }
}
