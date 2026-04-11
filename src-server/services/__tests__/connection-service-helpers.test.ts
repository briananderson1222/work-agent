import { describe, expect, test } from 'vitest';
import {
  hasRequiredMissing,
  listRuntimeConnectionsForAdapters,
  mergeRuntimeConfig,
  runtimeDescriptionForProvider,
  runtimeIdForProvider,
  runtimeNameForProvider,
  sanitizeRuntimeConfig,
  statusFromPrerequisites,
} from '../connection-service-helpers.js';

describe('connection-service helpers', () => {
  test('detects required missing prerequisites', () => {
    expect(
      hasRequiredMissing([
        { id: 'a', category: 'optional', status: 'missing' },
        { id: 'b', category: 'required', status: 'missing' },
      ] as any),
    ).toBe(true);
    expect(
      hasRequiredMissing([
        { id: 'a', category: 'optional', status: 'missing' },
      ] as any),
    ).toBe(false);
  });

  test('computes runtime naming and config helpers', () => {
    expect(runtimeIdForProvider('codex')).toBe('codex-runtime');
    expect(runtimeNameForProvider('claude')).toBe('Claude Runtime');
    expect(runtimeDescriptionForProvider('bedrock')).toContain('VoltAgent/Strands');
    expect(sanitizeRuntimeConfig('codex-runtime', { defaultModel: '  x  ' })).toEqual({
      defaultModel: 'x',
    });
    expect(sanitizeRuntimeConfig('acp', { defaultModel: 'x' })).toEqual({});
    expect(
      mergeRuntimeConfig(
        'codex-runtime',
        { defaultModel: 'base-model' } as any,
        { config: { defaultModel: 'override-model' } } as any,
      ),
    ).toEqual({ defaultModel: 'override-model' });
  });

  test('builds runtime connections including ACP aggregate state', async () => {
    const connections = await listRuntimeConnectionsForAdapters({
      adapters: [
        {
          provider: 'codex',
          getPrerequisites: async () => [],
        },
      ] as any,
      appConfig: {
        defaultModel: 'claude-3-7',
        runtimeConnections: {
          'codex-runtime': { name: 'Custom Codex', enabled: true, config: {} },
          acp: { enabled: true },
        },
      } as any,
      acpConnections: [{ id: 'kiro', enabled: true }] as any,
      acpStatus: { connections: [{ id: 'kiro', status: 'available' }] },
    });

    expect(connections).toEqual([
      expect.objectContaining({
        id: 'codex-runtime',
        name: 'Custom Codex',
        status: 'ready',
      }),
      expect.objectContaining({
        id: 'acp',
        status: 'ready',
        config: { configuredCount: 1, connectedCount: 1 },
      }),
    ]);
  });

  test('maps enabled and prerequisites into connection status', () => {
    expect(statusFromPrerequisites(false, [])).toBe('disabled');
    expect(
      statusFromPrerequisites(true, [
        { id: 'x', category: 'required', status: 'missing' },
      ] as any),
    ).toBe('missing_prerequisites');
    expect(statusFromPrerequisites(true, [])).toBe('ready');
  });
});
