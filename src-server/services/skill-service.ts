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
import { readdir, readFile, mkdir, rm, } from 'node:fs/promises';
import { join, extname } from 'node:path';
import {
  type ResolvedSkill,
  type SkillResource,
  handleSkillRead,
  parseFrontmatter,
  parseSkillContent,
  toDisclosureInstructions,
  toDisclosurePrompt,
  toReadToolSchema,
  extractResourceLinks,
} from 'agent-skills-ts-sdk';
import { createLogger } from '../utils/logger.js';
import { skillDiscoveries, skillActivations, skillActivationDuration } from '../telemetry/metrics.js';

const logger = createLogger({ name: 'skills' });

// ── Skill Registry ─────────────────────────────────────

const registry = new Map<string, ResolvedSkill>();

/**
 * Scan directories for SKILL.md files and populate the registry.
 */
export async function discoverSkills(
  projectHomeDir: string,
  projectSlug?: string,
): Promise<void> {
  registry.clear();

  const dirs = [
    join(projectHomeDir, 'skills'), // global skills
    join(projectHomeDir, 'plugins'), // plugin-shipped skills
  ];

  // Project-scoped skills take precedence
  if (projectSlug) {
    dirs.unshift(join(projectHomeDir, 'projects', projectSlug, 'skills'));
  }

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    await scanDirectory(dir);
  }

  logger.info('Skills discovered', { count: registry.size, projectSlug });
  skillDiscoveries.add(1, { count: registry.size, projectSlug: projectSlug || 'global' });
}

async function scanDirectory(dir: string, depth = 0): Promise<void> {
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

        // Resolve tier-3 resources
        const links = extractResourceLinks(body);
        const resources: SkillResource[] = [];
        for (const link of links) {
          const resourcePath = join(dir, entry.name, link.path);
          if (existsSync(resourcePath)) {
            const resourceContent = await readFile(resourcePath, 'utf-8');
            resources.push({ name: link.name, path: link.path, content: resourceContent });
          }
        }

        registry.set(properties.name, {
          name: properties.name,
          description: properties.description,
          body,
          resources,
          location: skillMdPath,
        });
      } catch (e) {
        logger.warn('Failed to parse skill', { path: skillMdPath, error: e });
      }
    } else {
      // Recurse into subdirectories (for plugin skill bundles)
      await scanDirectory(join(dir, entry.name), depth + 1);
    }
  }
}

// ── Prompt Generation (Tier 1) ─────────────────────────

/**
 * Build the skill catalog + behavioral instructions for system prompt injection.
 * Returns empty string if no skills are loaded.
 */
export function getSkillCatalogPrompt(skillNames?: string[]): string {
  if (registry.size === 0) return '';

  // If skillNames provided, filter to only those skills. Empty array = no skills.
  if (skillNames !== undefined) {
    if (skillNames.length === 0) return '';
  }

  const allSkills = Array.from(registry.values());
  const filtered = skillNames !== undefined
    ? allSkills.filter((s) => skillNames.includes(s.name))
    : allSkills;
  if (filtered.length === 0) return '';

  const entries = filtered.map((s) => ({
    name: s.name,
    description: s.description,
    resources: s.resources.map((r) => r.name),
  }));

  const catalog = toDisclosurePrompt(entries);
  const instructions = toDisclosureInstructions({ toolName: 'activate_skill' });
  return `${catalog}\n\n${instructions}`;
}

// ── Tool Definition (Tier 2 + 3) ───────────────────────

/**
 * Build the activate_skill tool definition for registration with the agent framework.
 * Returns null if no skills are loaded.
 */
export function getSkillTool(skillNames?: string[]): {
  name: string;
  description: string;
  parameters: object;
  execute: (input: any) => Promise<any>;
} | null {
  const allSkills = Array.from(registry.values());
  const skills = skillNames !== undefined
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
      skillActivationDuration.record(Date.now() - start, { skill: input.name || 'unknown' });
      if (!result.ok) {
        return { error: (result as any).error };
      }

      // If this is a tier-2 activation (no resource specified), enrich with metadata
      const skill = registry.get(input.name);
      if (skill && !input.resource) {
        const scriptTools = getScriptToolDefs(skill);
        const allowedTools = getAllowedTools(skill);
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

// ── API Helpers ─────────────────────────────────────────

export function listSkills(): Array<{ name: string; description: string }> {
  return Array.from(registry.values()).map((s) => ({
    name: s.name,
    description: s.description,
  }));
}

export function getSkillCount(): number {
  return registry.size;
}

// ── Dynamic Script Tools (Tier 3) ──────────────────────

const SCRIPT_EXTS = new Set(['.py', '.sh', '.js', '.ts']);

/**
 * Build tool definitions for scripts bundled with a skill.
 * These are returned alongside the skill body so the agent knows
 * executable scripts are available.
 */
function getScriptToolDefs(skill: ResolvedSkill): Array<{ name: string; description: string; path: string }> {
  return skill.resources
    .filter((r) => r.path.startsWith('scripts/') && SCRIPT_EXTS.has(extname(r.path)))
    .map((r) => ({
      name: `${skill.name}/${r.name}`,
      description: `Script from ${skill.name} skill: ${r.name}`,
      path: r.path,
    }));
}

/**
 * Parse allowed-tools from skill frontmatter.
 */
function getAllowedTools(skill: ResolvedSkill): string | undefined {
  // Re-parse frontmatter to get allowed-tools (not stored in ResolvedSkill)
  const location = skill.location;
  if (!location || !existsSync(location)) return undefined;
  try {
    const content = readFileSync(location, 'utf-8');
    const { metadata } = parseFrontmatter(content);
    return metadata['allowed-tools'] || undefined;
  } catch (e) {
    logger.debug('Failed to parse skill frontmatter for allowed-tools', { location, error: e });
    return undefined;
  }
}

// ── Install / Uninstall ────────────────────────────────

/**
 * Install a skill from a registry provider into the project skills directory.
 */
export async function installSkill(
  name: string,
  projectHomeDir: string,
  projectSlug?: string,
): Promise<{ success: boolean; message: string }> {
  const { getSkillRegistryProvider } = await import('../providers/registry.js');
  const provider = getSkillRegistryProvider();
  if (!provider) return { success: false, message: 'No skill registry configured' };

  const targetDir = projectSlug
    ? join(projectHomeDir, 'projects', projectSlug, 'skills')
    : join(projectHomeDir, 'skills');

  await mkdir(targetDir, { recursive: true });
  const result = await provider.install(name, targetDir);

  if (result.success) {
    // Re-discover skills to pick up the new one
    await discoverSkills(projectHomeDir, projectSlug);
  }

  return result;
}

/**
 * Uninstall a skill from the project skills directory.
 */
export async function uninstallSkill(
  name: string,
  projectHomeDir: string,
  projectSlug?: string,
): Promise<{ success: boolean; message: string }> {
  const targetDir = projectSlug
    ? join(projectHomeDir, 'projects', projectSlug, 'skills', name)
    : join(projectHomeDir, 'skills', name);

  if (!existsSync(targetDir)) return { success: false, message: `Skill '${name}' not found` };

  await rm(targetDir, { recursive: true, force: true });

  // Re-discover skills
  await discoverSkills(projectHomeDir, projectSlug);

  return { success: true, message: `Removed ${name}` };
}
