import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { Prompt } from '../providers/types.js';

function parseFrontmatter(content: string): { meta: Record<string, any>; body: string } {
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
        meta[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/["']/g, ''));
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

export function scanPromptDir(dir: string, namespace: string): Prompt[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  const now = new Date().toISOString();
  return files.map(file => {
    const raw = readFileSync(join(dir, file), 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const id = meta.id || basename(file, '.md');
    return {
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
    };
  });
}
