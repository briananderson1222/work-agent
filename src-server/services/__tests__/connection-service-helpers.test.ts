import { describe, expect, test } from 'vitest';
import {
  hasRequiredMissing,
  listRuntimeConnectionsForAdapters,
  mergeRuntimeConfig,
  runtimeIdForProvider,
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
    expect(
      sanitizeRuntimeConfig('codex-runtime', { defaultModel: '  x  ' }),
    ).toEqual({
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
          metadata: {
            displayName: 'Codex Runtime',
            description: 'Codex app-server runtime over the local Codex CLI.',
            capabilities: ['agent-runtime', 'resume'],
            runtimeId: 'codex-runtime',
            builtin: true,
            executionClass: 'connected',
          },
          getPrerequisites: async () => [],
          listModels: async () => [
            {
              id: 'gpt-5.4-codex',
              name: 'GPT-5.4 Codex',
              originalId: 'gpt-5.4-codex',
            },
          ],
          getCommands: async () => [
            {
              name: 'resume',
              description: 'Resume a session',
              passthrough: true,
            },
          ],
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
      acpStatus: {
        connections: [
          {
            id: 'kiro',
            status: 'available',
            slashCommands: [{ name: '/plan', description: 'Plan work' }],
          },
        ],
      },
    });

    expect(connections).toEqual([
      expect.objectContaining({
        id: 'codex-runtime',
        name: 'Custom Codex',
        status: 'ready',
        description: 'Codex app-server runtime over the local Codex CLI.',
        capabilities: ['agent-runtime', 'resume'],
        config: expect.objectContaining({
          defaultModel: 'claude-3-7',
          provider: 'codex',
          providerLabel: 'Codex',
        }),
        runtimeCatalog: expect.objectContaining({
          source: 'live',
          models: [
            {
              id: 'gpt-5.4-codex',
              name: 'GPT-5.4 Codex',
              originalId: 'gpt-5.4-codex',
            },
          ],
          fallbackModels: expect.arrayContaining([
            expect.objectContaining({ id: 'gpt-5.5' }),
          ]),
        }),
        capabilityInventory: expect.objectContaining({
          providerId: 'codex',
          connectionId: 'codex-runtime',
          freshness: 'live',
          models: [
            {
              id: 'gpt-5.4-codex',
              name: 'GPT-5.4 Codex',
              provider: 'codex',
            },
          ],
          slashCommands: [
            expect.objectContaining({
              id: 'resume',
              name: '/resume',
              description: 'Resume a session',
            }),
          ],
        }),
      }),
      expect.objectContaining({
        id: 'acp',
        status: 'ready',
        config: expect.objectContaining({
          configuredCount: 1,
          connectedCount: 1,
          executionClass: 'external',
        }),
        capabilityInventory: expect.objectContaining({
          providerId: 'acp',
          slashCommands: [
            expect.objectContaining({
              id: 'kiro:plan',
              name: '/plan',
            }),
          ],
        }),
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
