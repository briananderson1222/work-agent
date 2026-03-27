import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  skillDiscoveries: { add: vi.fn() },
  skillActivations: { add: vi.fn() },
  skillActivationDuration: { record: vi.fn() },
}));
vi.mock('agent-skills-ts-sdk', () => ({
  parseSkillContent: (content: string) => {
    const name = content.match(/name:\s*"?([^"\n]+)/)?.[1]?.trim() || 'unknown';
    const desc = content.match(/description:\s*"?([^"\n]+)/)?.[1]?.trim() || '';
    return { properties: { name, description: desc }, body: content };
  },
  extractResourceLinks: () => [],
  toDisclosurePrompt: (entries: any[]) =>
    entries.map((e) => `${e.name}: ${e.description}`).join('\n'),
  toDisclosureInstructions: () => 'Use activate_skill to load skills.',
  toReadToolSchema: (_skills: any[]) => ({
    name: 'activate_skill',
    description: 'Activate a skill',
    parametersJsonSchema: {},
  }),
  handleSkillRead: (_skills: any[], input: any) => ({
    ok: true,
    content: `Skill ${input.name} activated`,
  }),
  parseFrontmatter: (content: string) => ({ metadata: {}, body: content }),
}));

const {
  listSkills,
  getSkillCount,
  getSkillCatalogPrompt,
  getSkillTool,
  discoverSkills,
} = await import('../skill-service.js');

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `skill-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

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

  test('discoverSkills finds skills in skills/ directory', async () => {
    const skillDir = join(testDir, 'skills', 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: my-skill\ndescription: A test skill\n---\nBody content',
    );
    await discoverSkills(testDir);
    expect(getSkillCount()).toBe(1);
    expect(listSkills()[0].name).toBe('my-skill');
    rmSync(testDir, { recursive: true, force: true });
  });

  test('discoverSkills clears registry on re-scan', async () => {
    const skillDir = join(testDir, 'skills', 'temp-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: temp-skill\ndescription: Temp\n---\n',
    );
    await discoverSkills(testDir);
    expect(getSkillCount()).toBe(1);
    rmSync(skillDir, { recursive: true, force: true });
    await discoverSkills(testDir);
    expect(getSkillCount()).toBe(0);
    rmSync(testDir, { recursive: true, force: true });
  });

  test('getSkillCatalogPrompt filters by skill names', async () => {
    const dir1 = join(testDir, 'skills', 'skill-a');
    const dir2 = join(testDir, 'skills', 'skill-b');
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });
    writeFileSync(
      join(dir1, 'SKILL.md'),
      '---\nname: skill-a\ndescription: A\n---\n',
    );
    writeFileSync(
      join(dir2, 'SKILL.md'),
      '---\nname: skill-b\ndescription: B\n---\n',
    );
    await discoverSkills(testDir);
    expect(getSkillCount()).toBe(2);
    const filtered = getSkillCatalogPrompt(['skill-a']);
    expect(filtered).toContain('skill-a');
    expect(filtered).not.toContain('skill-b');
    rmSync(testDir, { recursive: true, force: true });
  });

  test('getSkillTool returns tool when skills exist', async () => {
    const skillDir = join(testDir, 'skills', 'tool-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: tool-skill\ndescription: Has tool\n---\n',
    );
    await discoverSkills(testDir);
    const tool = getSkillTool();
    expect(tool).not.toBeNull();
    expect(tool!.name).toBe('activate_skill');
    rmSync(testDir, { recursive: true, force: true });
  });

  test('discoverSkills skips directories without SKILL.md', async () => {
    const noSkillDir = join(testDir, 'skills', 'not-a-skill');
    mkdirSync(noSkillDir, { recursive: true });
    writeFileSync(join(noSkillDir, 'README.md'), '# Not a skill');
    await discoverSkills(testDir);
    expect(getSkillCount()).toBe(0);
    rmSync(testDir, { recursive: true, force: true });
  });
});
