import { describe, expect, test, vi } from 'vitest';
import {
  reloadRuntimeAgents,
  reloadRuntimeSkillsAndAgents,
  switchRuntimeAgent,
} from '../runtime-agent-lifecycle.js';

function createAgent(name: string) {
  return { name } as any;
}

describe('reloadRuntimeAgents', () => {
  test('reloads config, removes deleted agents, adds new agents, and preserves default metadata', async () => {
    const removedConfig = { disconnect: vi.fn().mockResolvedValue(undefined) };
    const activeAgents = new Map<string, any>([
      ['default', createAgent('default')],
      ['removed', createAgent('removed')],
    ]);
    const agentMetadataMap = new Map<string, any>([
      ['default', { slug: 'default', name: 'Default' }],
      ['removed', { slug: 'removed', name: 'Removed' }],
    ]);
    const agentSpecs = new Map<string, any>([['removed', { slug: 'removed' }]]);
    const agentTools = new Map<string, any[]>([['removed', []]]);
    const memoryAdapters = new Map<string, any>([['removed', {}]]);
    const mcpConfigs = new Map<string, any>([
      ['removed:server', removedConfig],
    ]);
    const mcpConnectionStatus = new Map<string, any>([
      ['removed:server', { connected: true }],
    ]);
    const integrationMetadata = new Map<string, any>([
      ['removed:server', { type: 'mcp' }],
    ]);
    const registerAgent = vi.fn();
    const logger = { info: vi.fn(), error: vi.fn() };
    const emit = vi.fn();
    const createVoltAgentInstance = vi.fn(async (slug: string) =>
      createAgent(slug),
    );

    const appConfig = await reloadRuntimeAgents({
      configLoader: {
        listAgents: vi.fn(async () => [
          { slug: 'new-agent', name: 'New Agent' },
        ]),
      } as any,
      activeAgents,
      agentMetadataMap,
      agentSpecs,
      agentTools,
      memoryAdapters,
      mcpConfigs,
      mcpConnectionStatus,
      integrationMetadata,
      voltAgent: { registerAgent },
      logger,
      eventBus: { emit },
      createVoltAgentInstance,
      loadAppConfig: async () => ({ logLevel: 'debug' }) as any,
      applyLogLevel: vi.fn(),
    });

    expect(appConfig).toEqual({ logLevel: 'debug' });
    expect(removedConfig.disconnect).toHaveBeenCalledTimes(1);
    expect(activeAgents.has('removed')).toBe(false);
    expect(activeAgents.has('new-agent')).toBe(true);
    expect(agentMetadataMap.get('default')).toEqual({
      slug: 'default',
      name: 'Default',
    });
    expect(agentMetadataMap.get('new-agent')).toEqual({
      slug: 'new-agent',
      name: 'New Agent',
    });
    expect(registerAgent).toHaveBeenCalledWith(activeAgents.get('new-agent'));
    expect(emit).toHaveBeenCalledWith('agents:changed', { count: 1 });
  });
});

describe('reloadRuntimeSkillsAndAgents', () => {
  test('discovers skills for the active project and rebuilds agents', async () => {
    const discoverSkills = vi.fn(async () => {});
    const createVoltAgentInstance = vi.fn(async (slug: string) =>
      createAgent(slug),
    );
    const activeAgents = new Map<string, any>();
    const logger = { info: vi.fn(), error: vi.fn() };

    await reloadRuntimeSkillsAndAgents({
      skillService: { discoverSkills },
      configLoader: {
        getProjectHomeDir: () => '/tmp/project',
        listAgents: vi.fn(async () => [{ slug: 'builder' }]),
      } as any,
      storageAdapter: {
        listProjects: () => [{ slug: 'project-a' }],
      } as any,
      activeAgents,
      logger,
      createVoltAgentInstance,
    });

    expect(discoverSkills).toHaveBeenCalledWith('/tmp/project', 'project-a');
    expect(createVoltAgentInstance).toHaveBeenCalledWith('builder');
    expect(activeAgents.get('builder')).toEqual(createAgent('builder'));
  });
});

describe('switchRuntimeAgent', () => {
  test('returns an existing agent without rebuilding', async () => {
    const agent = createAgent('existing');
    const createVoltAgentInstance = vi.fn(async () => createAgent('other'));

    const result = await switchRuntimeAgent({
      targetSlug: 'existing',
      activeAgents: new Map([['existing', agent]]),
      logger: { info: vi.fn() },
      createVoltAgentInstance,
    });

    expect(result).toBe(agent);
    expect(createVoltAgentInstance).not.toHaveBeenCalled();
  });

  test('creates and registers a new agent when missing', async () => {
    const activeAgents = new Map<string, any>();
    const registerAgent = vi.fn();
    const createdAgent = createAgent('new-agent');

    const result = await switchRuntimeAgent({
      targetSlug: 'new-agent',
      activeAgents,
      voltAgent: { registerAgent },
      logger: { info: vi.fn() },
      createVoltAgentInstance: async () => createdAgent,
    });

    expect(result).toBe(createdAgent);
    expect(activeAgents.get('new-agent')).toBe(createdAgent);
    expect(registerAgent).toHaveBeenCalledWith(createdAgent);
  });
});
