import { ACPStatus } from '@stallion-ai/contracts/acp';
import { describe, expect, test } from 'vitest';
import {
  findACPConfigIdForSlug,
  getACPManagerStatus,
  getACPManagerVirtualAgents,
} from '../acp-manager-view.js';

function createProbe({
  available = false,
  lastProbeAt = 0,
  modes = [],
  configOptions = [],
  capabilities = {},
}: {
  available?: boolean;
  lastProbeAt?: number;
  modes?: Array<{ id: string; name?: string; description?: string }>;
  configOptions?: any[];
  capabilities?: { image?: boolean };
}) {
  return {
    lastProbeAt,
    getModes: () => modes,
    getConfigOptions: () => configOptions,
    getCapabilities: () => capabilities,
    isAvailable: () => available,
  };
}

describe('acp-manager-view helpers', () => {
  test('builds virtual agents from probes and configs', () => {
    const probes = new Map([
      [
        'kiro',
        createProbe({
          modes: [{ id: 'dev', name: 'Dev Mode', description: 'Build things' }],
          configOptions: [
            {
              category: 'model',
              currentValue: 'claude-sonnet',
              options: [{ name: 'Claude Sonnet', value: 'claude-sonnet' }],
            },
          ],
          capabilities: { image: true },
        }),
      ],
    ]);
    const configs = new Map([
      ['kiro', { id: 'kiro', name: 'Kiro', icon: '🧪', enabled: true }],
    ]);

    const agents = getACPManagerVirtualAgents(probes as any, configs as any);

    expect(agents).toEqual([
      expect.objectContaining({
        slug: 'kiro-dev',
        name: 'Dev Mode',
        connectionName: 'Kiro',
        supportsAttachments: true,
        model: 'claude-sonnet',
        modelOptions: [
          {
            id: 'claude-sonnet',
            name: 'Claude Sonnet',
            originalId: 'claude-sonnet',
          },
        ],
      }),
    ]);
  });

  test('builds status and resolves slugs back to config ids', () => {
    const probes = new Map([
      [
        'kiro',
        createProbe({
          available: true,
          lastProbeAt: 123,
          modes: [{ id: 'dev' }],
          configOptions: [{ category: 'model', currentValue: 'claude-sonnet' }],
        }),
      ],
      [
        'claude',
        createProbe({
          available: false,
          lastProbeAt: 456,
          modes: [{ id: 'plan' }],
        }),
      ],
    ]);
    const configs = new Map([
      ['kiro', { id: 'kiro', name: 'Kiro', enabled: true }],
      ['claude', { id: 'claude', name: 'Claude', enabled: true }],
    ]);

    const status = getACPManagerStatus(probes as any, configs as any, 2);

    expect(status.activeSessions).toBe(2);
    expect(status.connections).toEqual([
      expect.objectContaining({
        id: 'kiro',
        status: ACPStatus.AVAILABLE,
        modes: ['dev'],
        currentModel: 'claude-sonnet',
      }),
      expect.objectContaining({
        id: 'claude',
        status: ACPStatus.UNAVAILABLE,
        modes: ['plan'],
        currentModel: null,
      }),
    ]);
    expect(findACPConfigIdForSlug(probes as any, 'kiro-dev')).toBe('kiro');
    expect(findACPConfigIdForSlug(probes as any, 'missing-agent')).toBeUndefined();
  });
});
