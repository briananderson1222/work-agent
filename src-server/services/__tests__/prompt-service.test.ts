import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock resolveHomeDir to use temp dir
const tempDir = mkdtempSync(join(tmpdir(), 'prompt-svc-test-'));
vi.mock('../../utils/paths.js', () => ({ resolveHomeDir: () => tempDir }));
vi.mock('../../telemetry/metrics.js', () => ({ promptOps: { add: vi.fn() } }));

const { PromptService } = await import('../prompt-service.js');

describe('PromptService', () => {
  let svc: InstanceType<typeof PromptService>;

  beforeEach(() => {
    // Clean prompts file between tests
    const promptsDir = join(tempDir, 'prompts');
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, 'prompts.json'), '[]');
    svc = new PromptService();
  });

  afterEach(() => {
    rmSync(join(tempDir, 'prompts'), { recursive: true, force: true });
  });

  test('listPrompts returns empty initially', async () => {
    expect(await svc.listPrompts()).toEqual([]);
  });

  test('addPrompt creates and returns prompt', async () => {
    const p = await svc.addPrompt({ name: 'Test', content: 'Do stuff' });
    expect(p.id).toBeDefined();
    expect(p.name).toBe('Test');
    expect(p.source).toBe('local');
  });

  test('getPrompt finds by id', async () => {
    const p = await svc.addPrompt({ name: 'Find Me', content: 'x' });
    expect(await svc.getPrompt(p.id)).toMatchObject({ name: 'Find Me' });
  });

  test('getPrompt returns null for missing', async () => {
    expect(await svc.getPrompt('nope')).toBeNull();
  });

  test('updatePrompt modifies fields', async () => {
    const p = await svc.addPrompt({ name: 'Old', content: 'x' });
    const updated = await svc.updatePrompt(p.id, { name: 'New' });
    expect(updated.name).toBe('New');
    expect(updated.id).toBe(p.id);
  });

  test('updatePrompt throws for missing', () => {
    expect(() => svc.updatePrompt('nope', { name: 'x' })).toThrow('not found');
  });

  test('deletePrompt removes', async () => {
    const p = await svc.addPrompt({ name: 'Del', content: 'x' });
    await svc.deletePrompt(p.id);
    expect(await svc.listPrompts()).toHaveLength(0);
  });

  test('deletePrompt throws for missing', () => {
    expect(() => svc.deletePrompt('nope')).toThrow('not found');
  });

  test('listProviders returns empty by default', () => {
    expect(svc.listProviders()).toEqual([]);
  });

  test('addProvider and listProviders', () => {
    svc.addProvider({ id: 'mock', displayName: 'Mock' } as any);
    expect(svc.listProviders()).toEqual([{ id: 'mock', displayName: 'Mock' }]);
  });

  test('registerPluginPrompts replaces by source', async () => {
    await svc.addPrompt({ name: 'Local', content: 'x' });
    svc.registerPluginPrompts([
      {
        id: 'p1',
        name: 'Plugin',
        content: 'y',
        source: 'plugin:test',
        createdAt: '',
        updatedAt: '',
      } as any,
    ]);
    const all = await svc.listPrompts();
    expect(all).toHaveLength(2);
    expect(all.find((p) => p.name === 'Plugin')).toBeDefined();
  });
});
