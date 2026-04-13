import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
  if (!existsSync(PROMPTS_FILE)) return [];
  return (JSON.parse(readFileSync(PROMPTS_FILE, 'utf-8')) as Prompt[]).map(
    (prompt) => normalizePrompt(prompt),
  );
}

function save(prompts: Prompt[]): void {
  if (!existsSync(PROMPTS_DIR)) mkdirSync(PROMPTS_DIR, { recursive: true });
  writeFileSync(
    PROMPTS_FILE,
    JSON.stringify(
      prompts.map((prompt) => normalizePrompt(prompt)),
      null,
      2,
    ),
    'utf-8',
  );
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
