import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  skillDiscoveries: { add: vi.fn() },
  skillActivations: { add: vi.fn() },
  skillActivationDuration: { record: vi.fn() },
}));
vi.mock('agent-skills-ts-sdk', () => ({
  parseSkillContent: (content: string) => ({ properties: { name: 'test-skill', description: 'A test' }, body: content }),
  extractResourceLinks: () => [],
  toDisclosurePrompt: (entries: any[]) => entries.map((e) => `${e.name}: ${e.description}`).join('\n'),
  toDisclosureInstructions: () => 'Use activate_skill to load skills.',
  toReadToolSchema: (skills: any[]) => ({ name: 'activate_skill', description: 'Activate a skill', parametersJsonSchema: {} }),
  handleSkillRead: (_skills: any[], input: any) => ({ ok: true, content: `Skill ${input.name} activated` }),
  parseFrontmatter: () => ({ metadata: {} }),
}));

const { listSkills, getSkillCount, getSkillCatalogPrompt, getSkillTool, discoverSkills } = await import('../skill-service.js');

describe('SkillService', () => {
  test('listSkills returns empty initially', () => {
    expect(listSkills()).toEqual([]);
  });

  test('getSkillCount returns 0 initially', () => {
    expect(getSkillCount()).toBe(0);
  });

  test('getSkillCatalogPrompt returns empty with no skills', () => {
    expect(getSkillCatalogPrompt()).toBe('');
  });

  test('getSkillTool returns null with no skills', () => {
    expect(getSkillTool()).toBeNull();
  });

  test('getSkillCatalogPrompt with empty array returns empty', () => {
    expect(getSkillCatalogPrompt([])).toBe('');
  });

  test('discoverSkills handles missing directories', async () => {
    await discoverSkills('/nonexistent/path');
    expect(getSkillCount()).toBe(0);
  });
});
