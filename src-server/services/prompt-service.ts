import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import type {
  GuidanceAsset,
  PlaybookOutcome,
  PlaybookSourceContext,
  PlaybookStats,
  Prompt,
} from '@stallion-ai/contracts/catalog';
import { playbookToGuidanceAsset } from '@stallion-ai/shared';
import type { IPromptRegistryProvider } from '../providers/provider-interfaces.js';
import { promptOps } from '../telemetry/metrics.js';
import { resolveHomeDir } from '../utils/paths.js';

const PROMPTS_DIR = join(resolveHomeDir(), 'prompts');
const PROMPTS_FILE = join(PROMPTS_DIR, 'prompts.json');
const PLAYBOOK_FILES_DIR = join(PROMPTS_DIR, 'files');

function defaultSourceContext(): PlaybookSourceContext {
  return { kind: 'user' };
}

function pluginSourceContext(): PlaybookSourceContext {
  return { kind: 'plugin' };
}

function createDefaultStats(): PlaybookStats {
  return {
    runs: 0,
    successes: 0,
    failures: 0,
    qualityScore: null,
  };
}

function computeQualityScore(stats: PlaybookStats): number | null {
  const totalOutcomes = stats.successes + stats.failures;
  if (totalOutcomes === 0) {
    return null;
  }
  return Math.round((stats.successes / totalOutcomes) * 100);
}

function normalizePrompt(
  prompt: Prompt,
  options?: {
    createdFrom?: PlaybookSourceContext;
    updatedFrom?: PlaybookSourceContext;
    stats?: PlaybookStats;
  },
): Prompt {
  const createdFrom =
    options?.createdFrom ??
    prompt.provenance?.createdFrom ??
    (prompt.source?.startsWith('plugin:')
      ? pluginSourceContext()
      : undefined) ??
    defaultSourceContext();
  const updatedFrom =
    options?.updatedFrom ?? prompt.provenance?.updatedFrom ?? createdFrom;
  const stats = {
    ...createDefaultStats(),
    ...prompt.stats,
    ...options?.stats,
  };

  return {
    ...prompt,
    provenance: {
      createdFrom,
      updatedFrom,
    },
    stats: {
      ...stats,
      qualityScore: computeQualityScore(stats),
    },
  };
}

function load(): Prompt[] {
  const prompts = [...loadJsonPrompts(), ...loadMarkdownPrompts()];
  const deduped = new Map<string, Prompt>();
  for (const prompt of prompts) {
    deduped.set(prompt.id, normalizePrompt(prompt));
  }
  return Array.from(deduped.values());
}

function save(prompts: Prompt[]): void {
  if (!existsSync(PROMPTS_DIR)) mkdirSync(PROMPTS_DIR, { recursive: true });
  writeFileSync(
    PROMPTS_FILE,
    JSON.stringify(jsonPrompts(prompts), null, 2),
    'utf-8',
  );
  if (!existsSync(PLAYBOOK_FILES_DIR))
    mkdirSync(PLAYBOOK_FILES_DIR, { recursive: true });
  const markdownPrompts = prompts.filter(
    (prompt) => prompt.storageMode === 'markdown-file',
  );
  const activeIds = new Set(markdownPrompts.map((prompt) => prompt.id));
  for (const file of readdirSync(PLAYBOOK_FILES_DIR)) {
    if (!file.endsWith('.md') && !file.endsWith('.meta.json')) continue;
    const id = file.replace(/\.meta\.json$|\.md$/g, '');
    if (!activeIds.has(id)) {
      rmSync(join(PLAYBOOK_FILES_DIR, file), { force: true });
    }
  }
  for (const prompt of markdownPrompts) {
    saveMarkdownPrompt(prompt);
  }
}

function loadJsonPrompts(): Prompt[] {
  if (!existsSync(PROMPTS_FILE)) return [];
  return JSON.parse(readFileSync(PROMPTS_FILE, 'utf-8')) as Prompt[];
}

function jsonPrompts(prompts: Prompt[]): Prompt[] {
  return prompts
    .filter((prompt) => prompt.storageMode !== 'markdown-file')
    .map((prompt) => normalizePrompt(prompt));
}

function parseFrontmatter(text: string): {
  meta: Record<string, any>;
  body: string;
} {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: text.trim() };
  const lines = match[1].split('\n');
  const meta: Record<string, any> = {};
  let currentArrayKey: string | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    if (currentArrayKey && line.trim().startsWith('- ')) {
      meta[currentArrayKey] ??= [];
      meta[currentArrayKey].push(
        line
          .trim()
          .slice(2)
          .replace(/^["']|["']$/g, ''),
      );
      continue;
    }
    currentArrayKey = null;
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!value) {
      currentArrayKey = key;
      continue;
    }
    if (value === 'true' || value === 'false') {
      meta[key] = value === 'true';
    } else {
      meta[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  return { meta, body: match[2].trim() };
}

function buildPromptMarkdown(prompt: Prompt): string {
  const parts = ['---', `name: "${prompt.name}"`];
  if (prompt.description) parts.push(`description: "${prompt.description}"`);
  if (prompt.category) parts.push(`category: "${prompt.category}"`);
  if (prompt.tags?.length) {
    parts.push('tags:');
    for (const tag of prompt.tags) parts.push(`  - ${tag}`);
  }
  if (prompt.agent) parts.push(`agent: "${prompt.agent}"`);
  if (prompt.global) parts.push('global: true');
  parts.push('assetType: playbook');
  parts.push('runtimeMode: slash-command');
  parts.push('---', '', prompt.content);
  return parts.join('\n');
}

function markdownMetaPath(id: string) {
  return join(PLAYBOOK_FILES_DIR, `${id}.meta.json`);
}

function markdownPromptPath(id: string) {
  return join(PLAYBOOK_FILES_DIR, `${id}.md`);
}

function saveMarkdownPrompt(prompt: Prompt): void {
  if (!existsSync(PLAYBOOK_FILES_DIR))
    mkdirSync(PLAYBOOK_FILES_DIR, { recursive: true });
  writeFileSync(
    markdownPromptPath(prompt.id),
    buildPromptMarkdown(prompt),
    'utf-8',
  );
  writeFileSync(
    markdownMetaPath(prompt.id),
    JSON.stringify(
      {
        id: prompt.id,
        source: prompt.source,
        provenance: prompt.provenance,
        stats: prompt.stats,
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt,
        storageMode: 'markdown-file',
      },
      null,
      2,
    ),
    'utf-8',
  );
}

function loadMarkdownPrompts(): Prompt[] {
  if (!existsSync(PLAYBOOK_FILES_DIR)) return [];
  const files = readdirSync(PLAYBOOK_FILES_DIR).filter((file) =>
    file.endsWith('.md'),
  );
  return files.map((file) => {
    const id = basename(file, '.md');
    const raw = readFileSync(join(PLAYBOOK_FILES_DIR, file), 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const metaPath = markdownMetaPath(id);
    const sidecar = existsSync(metaPath)
      ? JSON.parse(readFileSync(metaPath, 'utf-8'))
      : {};
    return {
      id: sidecar.id || id,
      name: meta.name || id,
      content: body,
      description: meta.description,
      category: meta.category,
      tags: meta.tags,
      agent: meta.agent,
      global: meta.global,
      source: sidecar.source || 'local',
      provenance: sidecar.provenance,
      stats: sidecar.stats,
      createdAt: sidecar.createdAt || new Date().toISOString(),
      updatedAt: sidecar.updatedAt || new Date().toISOString(),
      storageMode: 'markdown-file',
    } satisfies Prompt;
  });
}

export class PromptService {
  private providers = new Map<string, IPromptRegistryProvider>();

  listPrompts(): Promise<Prompt[]> {
    return Promise.resolve(load());
  }

  listGuidanceAssets(): Promise<GuidanceAsset[]> {
    return Promise.resolve(load().map(playbookToGuidanceAsset));
  }

  getPrompt(id: string): Promise<Prompt | null> {
    return Promise.resolve(load().find((p) => p.id === id) ?? null);
  }

  addPrompt(
    opts: {
      name: string;
      content: string;
      storageMode?: 'json-inline' | 'markdown-file';
      description?: string;
      category?: string;
      tags?: string[];
      agent?: string;
      global?: boolean;
    },
    sourceContext: PlaybookSourceContext = defaultSourceContext(),
  ): Promise<Prompt> {
    const prompts = load();
    const now = new Date().toISOString();
    const prompt = normalizePrompt(
      {
        id: crypto.randomUUID(),
        source: 'local',
        createdAt: now,
        updatedAt: now,
        ...opts,
      } satisfies Prompt,
      {
        createdFrom: sourceContext,
        updatedFrom: sourceContext,
      },
    );
    prompts.push(prompt);
    save(prompts);
    promptOps.add(1, { operation: 'create', prompt: opts.name });
    return Promise.resolve(prompt);
  }

  updatePrompt(
    id: string,
    updates: Partial<
      Omit<Prompt, 'id' | 'createdAt' | 'updatedAt' | 'source' | 'stats'>
    >,
    sourceContext: PlaybookSourceContext = defaultSourceContext(),
  ): Promise<Prompt> {
    const prompts = load();
    const idx = prompts.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Prompt '${id}' not found`);
    prompts[idx] = normalizePrompt(
      {
        ...prompts[idx],
        ...updates,
        id,
        updatedAt: new Date().toISOString(),
      },
      {
        createdFrom:
          prompts[idx].provenance?.createdFrom ?? defaultSourceContext(),
        updatedFrom: sourceContext,
      },
    );
    save(prompts);
    promptOps.add(1, { operation: 'update', prompt: prompts[idx].name });
    return Promise.resolve(prompts[idx]);
  }

  trackPromptRun(id: string): Promise<Prompt> {
    const prompts = load();
    const idx = prompts.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Prompt '${id}' not found`);
    const currentStats = prompts[idx].stats ?? createDefaultStats();
    prompts[idx] = normalizePrompt(
      {
        ...prompts[idx],
        updatedAt: new Date().toISOString(),
      },
      {
        stats: {
          ...currentStats,
          runs: currentStats.runs + 1,
          lastRunAt: new Date().toISOString(),
        },
      },
    );
    save(prompts);
    promptOps.add(1, { operation: 'run', prompt: prompts[idx].name });
    return Promise.resolve(prompts[idx]);
  }

  recordPromptOutcome(id: string, outcome: PlaybookOutcome): Promise<Prompt> {
    const prompts = load();
    const idx = prompts.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Prompt '${id}' not found`);
    const currentStats = prompts[idx].stats ?? createDefaultStats();
    prompts[idx] = normalizePrompt(
      {
        ...prompts[idx],
        updatedAt: new Date().toISOString(),
      },
      {
        stats: {
          ...currentStats,
          successes: currentStats.successes + (outcome === 'success' ? 1 : 0),
          failures: currentStats.failures + (outcome === 'failure' ? 1 : 0),
          lastOutcomeAt: new Date().toISOString(),
        },
      },
    );
    save(prompts);
    promptOps.add(1, {
      operation: `outcome:${outcome}`,
      prompt: prompts[idx].name,
    });
    return Promise.resolve(prompts[idx]);
  }

  deletePrompt(id: string): Promise<void> {
    const prompts = load();
    const idx = prompts.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Prompt '${id}' not found`);
    const deleted = prompts[idx];
    prompts.splice(idx, 1);
    save(prompts);
    promptOps.add(1, { operation: 'delete', prompt: deleted.name });
    return Promise.resolve();
  }

  registerPluginPrompts(prompts: Prompt[]): void {
    const existing = load();
    const sources = new Set(prompts.map((p) => p.source));
    const filtered = existing.filter(
      (p) => !p.source || !sources.has(p.source),
    );
    const existingById = new Map(existing.map((prompt) => [prompt.id, prompt]));
    const merged = prompts.map((prompt) => {
      const current = existingById.get(prompt.id);
      return normalizePrompt(
        {
          ...current,
          ...prompt,
          createdAt: current?.createdAt ?? prompt.createdAt,
          updatedAt: prompt.updatedAt || current?.updatedAt || prompt.createdAt,
        },
        {
          createdFrom:
            current?.provenance?.createdFrom ?? pluginSourceContext(),
          updatedFrom:
            current?.provenance?.updatedFrom ?? pluginSourceContext(),
          stats: current?.stats ?? prompt.stats ?? createDefaultStats(),
        },
      );
    });
    save([...filtered, ...merged]);
  }

  addProvider(provider: IPromptRegistryProvider): void {
    this.providers.set(provider.id, provider);
  }

  listProviders(): Array<{ id: string; displayName: string }> {
    return [...this.providers.values()].map((p) => ({
      id: p.id,
      displayName: p.displayName,
    }));
  }
}
