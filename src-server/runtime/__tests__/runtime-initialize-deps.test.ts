import { describe, expect, test, vi } from 'vitest';
import { createRuntimeInitializationDeps } from '../runtime-initialize-deps.js';

describe('createRuntimeInitializationDeps', () => {
  test('forwards runtime state and delegates initialization hooks', async () => {
    const createVoltAgentInstance = vi.fn(async (slug: string) => ({ slug }));
    const configureRoutes = vi.fn();
    const reloadAgents = vi.fn(async () => {});
    const replaceTemplateVariables = vi.fn((text: string, agentName?: string) =>
      `${text}:${agentName ?? ''}`,
    );
    const checkBedrockCredentials = vi.fn(async () => true);
    const createDefaultSkillRegistryProvider = vi.fn(async () => ({
      id: 'provider',
    }));
    const runStartupMigrations = vi.fn(async () => {});
    const startHealthChecks = vi.fn();

    const deps = createRuntimeInitializationDeps({
      port: 4123,
      logger: { info: vi.fn(), debug: vi.fn() } as any,
      eventBus: { emit: vi.fn() } as any,
      timers: [],
      configLoader: {
        loadAppConfig: vi.fn(async () => ({ region: 'us-west-2' })),
        loadPluginOverrides: vi.fn(async () => ({})),
        loadACPConfig: vi.fn(async () => ({})),
        getProjectHomeDir: () => '/tmp/project',
      },
      storageAdapter: { kind: 'storage' } as any,
      skillService: { discoverSkills: vi.fn(async () => {}) } as any,
      feedbackService: { kind: 'feedback' } as any,
      voiceService: { kind: 'voice' } as any,
      acpBridge: { kind: 'acp' } as any,
      orchestrationEventStore: { kind: 'events' } as any,
      usageAggregator: { kind: 'usage' } as any,
      activeAgents: new Map([['default', { id: 'agent' } as any]]),
      agentMetadataMap: new Map([['default', { slug: 'default' }]]),
      memoryAdapters: new Map([['default', { kind: 'memory' }]]),
      agentTools: new Map([['default', [{ name: 'tool' }]]]),
      agentSpecs: new Map([['default', { slug: 'default' } as any]]),
      mcpConfigs: new Map([['server:tool', { kind: 'mcp' }]]),
      mcpConnectionStatus: new Map([['server:tool', { connected: true }]]),
      integrationMetadata: new Map([['server:tool', { type: 'mcp' }]]),
      toolNameMapping: new Map([
        ['tool', { original: 'tool', normalized: 'tool', server: null, tool: 'tool' }],
      ]),
      toolNameReverseMapping: new Map([['tool', 'tool']]),
      eventLog: { persist: vi.fn(async () => {}) } as any,
      bedrockAdapter: { kind: 'bedrock' } as any,
      claudeAdapter: { kind: 'claude' } as any,
      codexAdapter: { kind: 'codex' } as any,
      createVoltAgentInstance,
      configureRoutes,
      reloadAgents,
      replaceTemplateVariables,
      checkBedrockCredentials,
      createDefaultSkillRegistryProvider,
      runStartupMigrations,
      startHealthChecks,
    });

    expect(deps.port).toBe(4123);
    expect(deps.activeAgents).toBeInstanceOf(Map);
    expect(deps.createVoltAgentInstance).toBe(createVoltAgentInstance);
    expect(deps.configureRoutes).toBe(configureRoutes);
    expect(deps.reloadAgents).toBe(reloadAgents);
    expect(deps.replaceTemplateVariables).toBe(replaceTemplateVariables);
    expect(deps.startHealthChecks).toBe(startHealthChecks);

    await expect(deps.checkBedrockCredentials()).resolves.toBe(true);
    await expect(deps.createDefaultSkillRegistryProvider()).resolves.toEqual({
      id: 'provider',
    });
    await deps.runStartupMigrations('/tmp/project');

    expect(checkBedrockCredentials).toHaveBeenCalledTimes(1);
    expect(createDefaultSkillRegistryProvider).toHaveBeenCalledTimes(1);
    expect(runStartupMigrations).toHaveBeenCalledWith('/tmp/project');
  });
});
