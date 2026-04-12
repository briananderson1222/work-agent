import { describe, expect, test, vi } from 'vitest';
import {
  bootstrapRuntimeDefaultAgent,
  createRuntimeSelfIntegration,
} from '../runtime-default-agent.js';

describe('createRuntimeSelfIntegration', () => {
  test('builds the stallion-control integration payload', () => {
    const { selfIntegrationId, selfIntegration } =
      createRuntimeSelfIntegration(4111);

    expect(selfIntegrationId).toBe('stallion-control');
    expect(selfIntegration).toEqual(
      expect.objectContaining({
        id: 'stallion-control',
        command: 'node',
        transport: 'stdio',
        env: {
          STALLION_API_BASE: 'http://127.0.0.1:4111',
          STALLION_PORT: '4111',
        },
      }),
    );
    expect(selfIntegration.args[0]).toContain('stallion-control.js');
  });
});

describe('bootstrapRuntimeDefaultAgent', () => {
  test('creates the integration, default agent, and runtime state', async () => {
    const configLoader = {
      saveIntegration: vi.fn(async () => {}),
      getProjectHomeDir: vi.fn(() => '/tmp/project'),
    } as any;
    const framework = {
      createTempAgent: vi.fn(async () => ({ id: 'default-agent' })),
    } as any;
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    } as any;
    const loadAgentTools = vi.fn(async () => [{ name: 'tool-1' }]);
    const createModel = vi.fn(async () => ({ id: 'model-1' }));
    const activeAgents = new Map();
    const agentTools = new Map();
    const memoryAdapters = new Map();
    const agentMetadataMap = new Map();

    const agents = await bootstrapRuntimeDefaultAgent({
      appConfig: {
        region: 'us-west-2',
        defaultModel: 'claude-sonnet',
        invokeModel: 'claude-sonnet',
        structureModel: 'claude-sonnet',
      },
      configLoader,
      framework,
      logger,
      port: 4111,
      defaultSystemPrompt: 'default prompt',
      autoApproveTools: ['stallion-control_read'],
      replaceTemplateVariables: (text) => text,
      createModel,
      loadAgentTools,
      activeAgents,
      agentTools,
      memoryAdapters,
      agentMetadataMap,
    });

    expect(configLoader.saveIntegration).toHaveBeenCalledWith(
      'stallion-control',
      expect.objectContaining({
        id: 'stallion-control',
      }),
    );
    expect(createModel).toHaveBeenCalled();
    expect(loadAgentTools).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({
        tools: expect.objectContaining({
          mcpServers: ['stallion-control'],
        }),
      }),
    );
    expect(framework.createTempAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'default',
      }),
    );
    expect(agents).toEqual({ default: { id: 'default-agent' } });
    expect(activeAgents.has('default')).toBe(true);
    expect(agentTools.get('default')).toEqual([{ name: 'tool-1' }]);
    expect(memoryAdapters.has('default')).toBe(true);
    expect(agentMetadataMap.get('default')).toEqual(
      expect.objectContaining({
        slug: 'default',
        name: 'Stallion',
      }),
    );
  });
});
