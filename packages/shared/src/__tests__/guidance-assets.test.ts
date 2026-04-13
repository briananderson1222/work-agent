import type { Playbook, Skill } from '@stallion-ai/contracts/catalog';
import { describe, expect, test } from 'vitest';
import {
  playbookToGuidanceAsset,
  skillToGuidanceAsset,
} from '../guidance-assets';

describe('guidance asset adapters', () => {
  test('maps playbooks into normalized guidance assets', () => {
    const playbook: Playbook = {
      id: 'p1',
      name: 'Deploy Plan',
      content: 'Run deploy now',
      description: 'Deployment workflow',
      category: 'Ops',
      tags: ['deploy'],
      agent: 'deployer',
      global: false,
      source: 'local',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    };

    expect(playbookToGuidanceAsset(playbook)).toEqual(
      expect.objectContaining({
        id: 'p1',
        kind: 'playbook',
        name: 'Deploy Plan',
        body: 'Run deploy now',
        storageMode: 'json-inline',
        runtimeMode: 'slash-command',
        scope: { agent: 'deployer', global: false },
      }),
    );
  });

  test('maps installed skills into normalized guidance assets', () => {
    const skill: Skill = {
      id: 'skill-one',
      name: 'skill-one',
      description: 'Installed skill',
      installed: true,
      installedVersion: '1.2.3',
      version: '1.2.3',
      path: '/tmp/skills/skill-one',
      source: 'local',
      body: 'Skill body',
      resources: [{ name: 'Guide', path: 'references/guide.md' }],
    };

    expect(skillToGuidanceAsset(skill)).toEqual(
      expect.objectContaining({
        id: 'skill-one',
        kind: 'skill',
        name: 'skill-one',
        body: 'Skill body',
        storageMode: 'skill-package',
        runtimeMode: 'skill-catalog',
        packaging: expect.objectContaining({
          installable: true,
          installed: true,
          installedVersion: '1.2.3',
          path: '/tmp/skills/skill-one',
          resources: [{ name: 'Guide', path: 'references/guide.md' }],
        }),
      }),
    );
  });
});
