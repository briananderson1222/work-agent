import { describe, expect, test, vi } from 'vitest';
import {
  getACPConnectionCommandOptions,
  getACPConnectionSlashCommands,
  getACPConnectionStatus,
  getACPConnectionVirtualAgentViews,
} from '../acp-connection-queries.js';

describe('acp-connection-queries helpers', () => {
  test('builds status and virtual agents using detected model fallback', () => {
    const configOptions = [
      {
        category: 'workspace',
        currentValue: 'default',
      },
    ];

    expect(
      getACPConnectionStatus({
        status: 'connected',
        modes: [{ id: 'dev', name: 'Dev' }] as any,
        sessionId: 'session-1',
        mcpServers: ['filesystem'],
        configOptions,
        detectedModel: 'Claude Sonnet',
        interactive: { args: ['--interactive'] },
      }),
    ).toEqual({
      status: 'connected',
      modes: ['dev'],
      sessionId: 'session-1',
      mcpServers: ['filesystem'],
      configOptions,
      currentModel: 'Claude Sonnet',
      interactive: { args: ['--interactive'] },
    });

    expect(
      getACPConnectionVirtualAgentViews({
        modes: [
          { id: 'dev', name: 'Dev Mode', description: 'Build things' },
        ] as any,
        prefix: 'kiro',
        config: {
          id: 'kiro',
          name: 'Kiro',
          icon: '🧪',
          enabled: true,
        } as any,
        configOptions,
        promptCapabilities: { image: true },
        detectedModel: 'Claude Sonnet',
      }),
    ).toEqual([
      expect.objectContaining({
        slug: 'kiro-dev',
        name: 'Dev Mode',
        model: 'Claude Sonnet',
        supportsAttachments: true,
      }),
    ]);
  });

  test('returns slash commands only for connection-owned agents', () => {
    const slashCommands = [{ name: '/plan' }, { name: '/fix' }] as any;

    expect(
      getACPConnectionSlashCommands({
        slug: 'kiro-dev',
        prefix: 'kiro',
        modes: [{ id: 'dev' }] as any,
        slashCommands,
      }),
    ).toBe(slashCommands);
    expect(
      getACPConnectionSlashCommands({
        slug: 'other-dev',
        prefix: 'kiro',
        modes: [{ id: 'dev' }] as any,
        slashCommands,
      }),
    ).toEqual([]);
  });

  test('returns ACP command options when the ext method succeeds', async () => {
    const extMethod = vi.fn().mockResolvedValue({
      options: [{ command: '/plan', description: 'Plan' }],
    });

    await expect(
      getACPConnectionCommandOptions({
        connection: { extMethod } as any,
        sessionId: 'session-1',
        partialCommand: '/pl',
        logger: { debug: vi.fn() },
        timeoutMs: 10,
      }),
    ).resolves.toEqual([{ command: '/plan', description: 'Plan' }]);

    expect(extMethod).toHaveBeenCalledWith('_kiro.dev/commands/options', {
      sessionId: 'session-1',
      partialCommand: '/pl',
    });
  });

  test('returns an empty array when ACP command options fail', async () => {
    const logger = { debug: vi.fn() };

    await expect(
      getACPConnectionCommandOptions({
        connection: {
          extMethod: vi.fn().mockRejectedValue(new Error('boom')),
        } as any,
        sessionId: 'session-1',
        partialCommand: '/pl',
        logger,
        timeoutMs: 10,
      }),
    ).resolves.toEqual([]);

    expect(logger.debug).toHaveBeenCalledWith(
      'Failed to get command options',
      expect.objectContaining({
        error: expect.any(Error),
      }),
    );
  });
});
