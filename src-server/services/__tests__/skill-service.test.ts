import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  skillDiscoveries: { add: vi.fn() },
  skillActivations: { add: vi.fn() },
  skillActivationDuration: { record: vi.fn() },
  skillDiscoveryDuration: { record: vi.fn() },
  skillOps: { add: vi.fn() },
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

const { SkillService } = await import('../skill-service.js');

let testDir: string;
const mockConfigLoader = {
  getProjectHomeDir: () => testDir,
  loadSkill: vi.fn(),
  saveSkill: vi.fn(),
  deleteSkill: vi.fn(),
  listSkills: vi.fn().mockResolvedValue([]),
  skillExists: vi.fn().mockResolvedValue(false),
};
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

let service: InstanceType<typeof SkillService>;

beforeEach(() => {
  testDir = join(tmpdir(), `skill-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  vi.clearAllMocks();
  service = new SkillService(mockConfigLoader as any, mockLogger);
});

describe('SkillService', () => {
  test('listSkills returns empty initially', () => {
    expect(service.listSkills()).toEqual([]);
  });

  test('listGuidanceAssets normalizes installed skills into guidance assets', async () => {
    const skillDir = join(testDir, 'skills', 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: my-skill\ndescription: A test skill\n---\nBody content',
    );
    writeFileSync(
      join(skillDir, '.stallion-meta.json'),
      JSON.stringify({ version: '1.0.0' }),
    );

    await service.discoverSkills(testDir);

    expect(service.listGuidanceAssets()).toEqual([
      expect.objectContaining({
        kind: 'skill',
        name: 'my-skill',
        body: expect.stringContaining('Body content'),
        description: 'A test skill',
        runtimeMode: 'skill-catalog',
        packaging: expect.objectContaining({
          path: skillDir,
        }),
      }),
    ]);
    rmSync(testDir, { recursive: true, force: true });
  });

  test('getSkillCount returns 0 initially', () => {
    expect(service.getSkillCount()).toBe(0);
  });

  test('getSkillCatalogPrompt returns empty with no skills', () => {
    expect(service.getSkillCatalogPrompt()).toBe('');
  });

  test('getSkillTool returns null with no skills', () => {
    expect(service.getSkillTool()).toBeNull();
  });

  test('getSkillCatalogPrompt with empty array returns empty', () => {
    expect(service.getSkillCatalogPrompt([])).toBe('');
  });

  test('discoverSkills handles missing directories', async () => {
    await service.discoverSkills('/nonexistent/path');
    expect(service.getSkillCount()).toBe(0);
  });

  test('discoverSkills finds skills in skills/ directory', async () => {
    const skillDir = join(testDir, 'skills', 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: my-skill\ndescription: A test skill\n---\nBody content',
    );
    await service.discoverSkills(testDir);
    expect(service.getSkillCount()).toBe(1);
    expect(service.listSkills()[0].name).toBe('my-skill');
    rmSync(testDir, { recursive: true, force: true });
  });

  test('discoverSkills clears registry on re-scan', async () => {
    const skillDir = join(testDir, 'skills', 'temp-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: temp-skill\ndescription: Temp\n---\n',
    );
    await service.discoverSkills(testDir);
    expect(service.getSkillCount()).toBe(1);
    rmSync(skillDir, { recursive: true, force: true });
    await service.discoverSkills(testDir);
    expect(service.getSkillCount()).toBe(0);
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
    await service.discoverSkills(testDir);
    expect(service.getSkillCount()).toBe(2);
    const filtered = service.getSkillCatalogPrompt(['skill-a']);
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
    await service.discoverSkills(testDir);
    const tool = service.getSkillTool();
    expect(tool).not.toBeNull();
    expect(tool!.name).toBe('activate_skill');
    rmSync(testDir, { recursive: true, force: true });
  });

  test('getSkill delegates to configLoader.loadSkill', async () => {
    const config = {
      name: 'test',
      source: 'local',
      installedAt: '2026-01-01',
      path: '/test',
    };
    mockConfigLoader.loadSkill.mockResolvedValue(config);
    const result = await service.getSkill('test');
    expect(result).toEqual(config);
    expect(mockConfigLoader.loadSkill).toHaveBeenCalledWith('test');
  });

  test('discoverSkills skips directories without SKILL.md', async () => {
    const noSkillDir = join(testDir, 'skills', 'not-a-skill');
    mkdirSync(noSkillDir, { recursive: true });
    writeFileSync(join(noSkillDir, 'README.md'), '# Not a skill');
    await service.discoverSkills(testDir);
    expect(service.getSkillCount()).toBe(0);
    rmSync(testDir, { recursive: true, force: true });
  });
});
