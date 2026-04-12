import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Prompt } from '@stallion-ai/contracts/catalog';
import type { ContextSafetyFinding } from './context-safety.js';
import { scanContextText } from './context-safety.js';

function parseFrontmatter(content: string): {
  meta: Record<string, any>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content.trim() };
  const meta: Record<string, any> = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (val.startsWith('[') || val.startsWith('-')) {
      // Parse YAML array: either [a, b] or multiline - a\n- b
      if (val.startsWith('[')) {
        meta[key] = val
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/["']/g, ''));
      }
    } else {
      meta[key] = val.replace(/["']/g, '');
    }
  }
  // Handle multiline arrays (- item format)
  const lines = match[1].split('\n');
  let currentKey: string | null = null;
  for (const line of lines) {
    if (line.match(/^\w+:/) && !line.match(/^\s*-/)) {
      const colon = line.indexOf(':');
      const key = line.slice(0, colon).trim();
      const val = line.slice(colon + 1).trim();
      if (!val) currentKey = key;
      else currentKey = null;
    } else if (currentKey && line.trim().startsWith('- ')) {
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      meta[currentKey].push(line.trim().slice(2).replace(/["']/g, ''));
    }
  }
  return { meta, body: match[2].trim() };
}

export interface BlockedPromptFile {
  file: string;
  findings: ContextSafetyFinding[];
}

export function scanPromptDir(dir: string, namespace: string): Prompt[] {
  return scanPromptDirDetailed(dir, namespace).prompts;
}

export function scanPromptDirDetailed(
  dir: string,
  namespace: string,
): {
  blockedFiles: BlockedPromptFile[];
  prompts: Prompt[];
} {
  if (!existsSync(dir)) {
    return { blockedFiles: [], prompts: [] };
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  const now = new Date().toISOString();
  const prompts: Prompt[] = [];
  const blockedFiles: BlockedPromptFile[] = [];

  for (const file of files) {
    const raw = readFileSync(join(dir, file), 'utf-8');
    const hiddenChannelSafety = scanContextText(raw, {
      profile: 'hidden-only',
      source: `plugin prompt '${namespace}/${file}'`,
    });
    if (hiddenChannelSafety.blocked) {
      blockedFiles.push({ file, findings: hiddenChannelSafety.findings });
      continue;
    }

    const { meta, body } = parseFrontmatter(raw);
    const bodySafety = scanContextText(body, {
      source: `plugin prompt '${namespace}/${file}' body`,
    });
    if (bodySafety.blocked) {
      blockedFiles.push({ file, findings: bodySafety.findings });
      continue;
    }
    const id = meta.id || basename(file, '.md');
    prompts.push({
      id: `${namespace}:${id}`,
      name: meta.label || meta.name || id,
      content: body,
      description: meta.description,
      icon: meta.icon,
      requires: meta.requires,
      category: meta.category,
      tags: meta.tags,
      agent: meta.agent,
      source: `plugin:${namespace}`,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { blockedFiles, prompts };
}
