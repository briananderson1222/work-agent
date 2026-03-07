import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { IPromptRegistryProvider, Prompt } from '../providers/types.js';

const PROMPTS_DIR = join(homedir(), '.stallion-ai', 'prompts');
const PROMPTS_FILE = join(PROMPTS_DIR, 'prompts.json');

function load(): Prompt[] {
  if (!existsSync(PROMPTS_FILE)) return [];
  return JSON.parse(readFileSync(PROMPTS_FILE, 'utf-8')) as Prompt[];
}

function save(prompts: Prompt[]): void {
  if (!existsSync(PROMPTS_DIR)) mkdirSync(PROMPTS_DIR, { recursive: true });
  writeFileSync(PROMPTS_FILE, JSON.stringify(prompts, null, 2), 'utf-8');
}

export class PromptService {
  private providers = new Map<string, IPromptRegistryProvider>();

  listPrompts(): Promise<Prompt[]> {
    return Promise.resolve(load());
  }

  getPrompt(id: string): Promise<Prompt | null> {
    return Promise.resolve(load().find((p) => p.id === id) ?? null);
  }

  addPrompt(opts: {
    name: string;
    content: string;
    description?: string;
    category?: string;
    tags?: string[];
    agent?: string;
  }): Promise<Prompt> {
    const prompts = load();
    const now = new Date().toISOString();
    const prompt: Prompt = {
      id: crypto.randomUUID(),
      source: 'local',
      createdAt: now,
      updatedAt: now,
      ...opts,
    };
    prompts.push(prompt);
    save(prompts);
    return Promise.resolve(prompt);
  }

  updatePrompt(id: string, updates: Partial<Omit<Prompt, 'id' | 'createdAt' | 'source'>>): Promise<Prompt> {
    const prompts = load();
    const idx = prompts.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Prompt '${id}' not found`);
    prompts[idx] = { ...prompts[idx], ...updates, id, updatedAt: new Date().toISOString() };
    save(prompts);
    return Promise.resolve(prompts[idx]);
  }

  deletePrompt(id: string): Promise<void> {
    const prompts = load();
    const idx = prompts.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Prompt '${id}' not found`);
    prompts.splice(idx, 1);
    save(prompts);
    return Promise.resolve();
  }

  addProvider(provider: IPromptRegistryProvider): void {
    this.providers.set(provider.id, provider);
  }

  listProviders(): Array<{ id: string; displayName: string }> {
    return [...this.providers.values()].map((p) => ({ id: p.id, displayName: p.displayName }));
  }
}
