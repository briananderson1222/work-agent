import { describe, expect, test } from 'vitest';
import type {
  GuidanceAssetReference,
  Playbook,
  ProviderCapabilityInventory,
} from '../catalog.js';

describe('guidance capability contracts', () => {
  test('playbook provenance can reference a source guidance asset', () => {
    const source: GuidanceAssetReference = {
      kind: 'skill',
      id: 'review-skill',
      name: 'Review Skill',
      owner: 'user',
    };
    const playbook: Playbook = {
      id: 'pb-1',
      name: 'Review Playbook',
      content: 'Review this change',
      provenance: {
        createdFrom: {
          kind: 'asset',
          action: 'skill-to-playbook',
          convertedAt: '2026-04-25T00:00:00.000Z',
          asset: source,
        },
      },
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z',
    };

    expect(playbook.provenance?.createdFrom?.asset).toEqual(source);
  });

  test('provider capability inventory is keyed to provider connection truth', () => {
    const inventory: ProviderCapabilityInventory = {
      providerId: 'codex',
      connectionId: 'runtime-codex',
      displayName: 'Codex CLI',
      status: 'ready',
      authStatus: 'authenticated',
      version: '1.0.0',
      checkedAt: '2026-04-25T00:00:00.000Z',
      freshness: 'live',
      source: 'provider',
      models: [{ id: 'gpt-5.5', name: 'GPT-5.5' }],
      skills: [
        {
          id: 'codex:review',
          name: 'review',
          enabled: true,
          provenance: {
            kind: 'provider-capability',
            id: 'codex:review',
            name: 'review',
            owner: 'provider',
            providerId: 'codex',
            connectionId: 'runtime-codex',
          },
        },
      ],
      slashCommands: [],
    };

    expect(inventory.connectionId).toBe('runtime-codex');
    expect(inventory.skills[0].provenance.owner).toBe('provider');
  });
});
