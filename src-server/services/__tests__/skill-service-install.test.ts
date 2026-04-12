import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installSkillFromRegistry,
  removeInstalledSkill,
} from '../skill-service-install.js';

describe('skill-service-install', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skill-install-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('installs a skill through the first successful registry provider', async () => {
    const skillDir = join(tempDir, 'skills', 'deep-research');
    const saveSkill = vi.fn().mockResolvedValue(undefined);
    const rediscover = vi.fn().mockResolvedValue(undefined);
    const provider = {
      install: vi.fn().mockImplementation(async (_name: string, targetDir: string) => {
        mkdirSync(join(targetDir, 'deep-research'), { recursive: true });
        return { success: true, message: 'ok' };
      }),
      listAvailable: vi.fn().mockResolvedValue([
        {
          id: 'deep-research',
          description: 'Research skill',
          version: '1.2.3',
        },
      ]),
    };

    const result = await installSkillFromRegistry({
      name: 'deep-research',
      projectHomeDir: tempDir,
      configLoader: { saveSkill },
      providers: [{ provider }] as any,
      rediscover,
    });

    expect(result).toEqual({ success: true, message: 'ok' });
    expect(provider.install).toHaveBeenCalledWith(
      'deep-research',
      join(tempDir, 'skills'),
    );
    expect(saveSkill).toHaveBeenCalledWith(
      'deep-research',
      expect.objectContaining({
        version: '1.2.3',
        path: skillDir,
      }),
    );
    expect(JSON.parse(readFileSync(join(skillDir, '.stallion-meta.json'), 'utf-8'))).toEqual(
      expect.objectContaining({
        version: '1.2.3',
        source: 'registry',
      }),
    );
    expect(rediscover).toHaveBeenCalledOnce();
  });

  it('removes an installed skill directory and rediscoveries skills', async () => {
    const skillDir = join(tempDir, 'skills', 'deep-research');
    mkdirSync(skillDir, { recursive: true });
    const rediscover = vi.fn().mockResolvedValue(undefined);

    const result = await removeInstalledSkill({
      name: 'deep-research',
      projectHomeDir: tempDir,
      rediscover,
    });

    expect(result).toEqual({
      success: true,
      message: 'Removed deep-research',
    });
    expect(rediscover).toHaveBeenCalledOnce();
  });
});
