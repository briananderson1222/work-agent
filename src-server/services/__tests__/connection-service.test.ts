import { describe, expect, test, vi } from 'vitest';

vi.mock('../../providers/connection-factories.js', () => ({
  createLLMProvider: vi.fn(() => null),
  createEmbeddingProvider: vi.fn(() => null),
  createVectorDbProvider: vi.fn(() => null),
}));

import { ConnectionService } from '../connection-service.js';

describe('ConnectionService', () => {
  test('lists model and runtime connections', async () => {
    const providerService = {
      listProviderConnections: vi.fn(() => [
        {
          id: 'bedrock-model',
          type: 'bedrock',
          name: 'Bedrock',
          config: { region: 'us-east-1' },
          enabled: true,
          capabilities: ['llm', 'embedding'],
        },
      ]),
      saveProviderConnection: vi.fn(),
      deleteProviderConnection: vi.fn(),
      checkHealth: vi.fn().mockResolvedValue(true),
    };
    const claudeAdapter = {
      provider: 'claude' as const,
      metadata: {
        displayName: 'Claude Runtime',
        description:
          'Claude Agent SDK runtime with approvals and reasoning events.',
        capabilities: [
          'agent-runtime',
          'session-lifecycle',
          'tool-calls',
          'interrupt',
          'approvals',
          'reasoning-events',
        ] as const,
        runtimeId: 'claude-runtime',
        builtin: true,
      },
      getPrerequisites: vi.fn().mockResolvedValue([
        {
          id: 'anthropic-api-key',
          name: 'ANTHROPIC_API_KEY',
          description: 'Claude API key',
          status: 'installed' as const,
          category: 'required' as const,
        },
      ]),
    };
    const codexAdapter = {
      provider: 'codex' as const,
      metadata: {
        displayName: 'Codex Runtime',
        description: 'Codex app-server runtime over the local Codex CLI.',
        capabilities: [
          'agent-runtime',
          'session-lifecycle',
          'tool-calls',
          'interrupt',
          'approvals',
          'resume',
          'external-process',
        ] as const,
        runtimeId: 'codex-runtime',
        builtin: true,
      },
      getPrerequisites: vi.fn().mockResolvedValue([
        {
          id: 'openai-api-key',
          name: 'OPENAI_API_KEY',
          description: 'OpenAI API key',
          status: 'missing' as const,
          category: 'required' as const,
        },
      ]),
    };

    const service = new ConnectionService(
      providerService as any,
      () => [claudeAdapter, codexAdapter] as any,
      async () => [{ id: 'kiro', name: 'Kiro', enabled: true }],
      () => ({ connections: [{ id: 'kiro', status: 'available' }] }),
      async () => ({ defaultModel: 'claude-sonnet' }) as any,
      vi.fn(async (updates: any) => updates),
    );

    const connections = await service.listConnections();
    expect(connections.map((connection) => connection.id)).toEqual(
      expect.arrayContaining([
        'bedrock-model',
        'claude-runtime',
        'codex-runtime',
        'acp',
      ]),
    );
    expect(
      connections.find((connection) => connection.id === 'codex-runtime')
        ?.status,
    ).toBe('missing_prerequisites');
    expect(
      connections.find((connection) => connection.id === 'acp')?.config,
    ).toMatchObject({
      configuredCount: 1,
      connectedCount: 1,
    });
  });

  test('saves and deletes model connections through ProviderService', async () => {
    const providerService = {
      listProviderConnections: vi.fn(() => [
        {
          id: 'openai-compat',
          type: 'openai-compat',
          name: 'OpenAI Compat',
          config: { baseUrl: 'https://example.com' },
          enabled: true,
          capabilities: ['llm'],
        },
      ]),
      saveProviderConnection: vi.fn(),
      deleteProviderConnection: vi.fn(),
      checkHealth: vi.fn().mockResolvedValue(true),
    };
    const service = new ConnectionService(
      providerService as any,
      () => [],
      async () => [],
      () => ({ connections: [] }),
      async () => ({ defaultModel: 'claude-sonnet' }) as any,
      vi.fn(async (updates: any) => updates),
    );

    await service.saveConnection({
      id: 'openai-compat',
      kind: 'model',
      type: 'openai-compat',
      name: 'OpenAI Compat',
      enabled: true,
      description: 'OpenAI compatible endpoint',
      capabilities: ['llm'],
      config: { baseUrl: 'https://example.com' },
      status: 'ready',
      prerequisites: [],
      lastCheckedAt: null,
    });
    expect(providerService.saveProviderConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'openai-compat',
        type: 'openai-compat',
      }),
    );

    await service.deleteConnection('openai-compat');
    expect(providerService.deleteProviderConnection).toHaveBeenCalledWith(
      'openai-compat',
    );
  });

  test('saves and resets runtime connection overrides through app config', async () => {
    const providerService = {
      listProviderConnections: vi.fn(() => []),
      saveProviderConnection: vi.fn(),
      deleteProviderConnection: vi.fn(),
      checkHealth: vi.fn().mockResolvedValue(true),
    };
    let appConfig: any = {
      defaultModel: 'claude-sonnet',
      runtimeConnections: {},
    };
    const updateAppConfig = vi.fn(async (updates: any) => {
      appConfig = { ...appConfig, ...updates };
      return appConfig;
    });
    const service = new ConnectionService(
      providerService as any,
      () =>
        [
          {
            provider: 'claude' as const,
            metadata: {
              displayName: 'Claude Runtime',
              description:
                'Claude Agent SDK runtime with approvals and reasoning events.',
              capabilities: [
                'agent-runtime',
                'session-lifecycle',
                'tool-calls',
                'interrupt',
                'approvals',
                'reasoning-events',
              ] as const,
              runtimeId: 'claude-runtime',
              builtin: true,
            },
            getPrerequisites: vi.fn().mockResolvedValue([]),
          },
        ] as any,
      async () => [],
      () => ({ connections: [] }),
      async () => appConfig,
      updateAppConfig,
    );

    const saved = await service.saveConnection({
      id: 'claude-runtime',
      kind: 'runtime',
      type: 'claude-runtime',
      name: 'Claude Code Runtime',
      enabled: false,
      description:
        'Claude Agent SDK runtime with approvals and reasoning events.',
      capabilities: [
        'agent-runtime',
        'session-lifecycle',
        'tool-calls',
        'interrupt',
        'approvals',
        'reasoning-events',
      ],
      config: { defaultModel: 'claude-3-7-sonnet' },
      status: 'ready',
      prerequisites: [],
      lastCheckedAt: null,
    });

    expect(updateAppConfig).toHaveBeenCalledWith({
      runtimeConnections: {
        'claude-runtime': {
          name: 'Claude Code Runtime',
          enabled: false,
          config: { defaultModel: 'claude-3-7-sonnet' },
        },
      },
    });
    expect(saved.name).toBe('Claude Code Runtime');
    expect(saved.enabled).toBe(false);
    expect(saved.status).toBe('disabled');
    expect(saved.config).toMatchObject({
      defaultModel: 'claude-3-7-sonnet',
    });

    await service.deleteConnection('claude-runtime');
    expect(updateAppConfig).toHaveBeenLastCalledWith({
      runtimeConnections: {},
    });
  });
});
