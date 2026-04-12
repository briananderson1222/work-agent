import { describe, expect, test, vi } from 'vitest';
import {
  bootstrapRuntimeVoiceAgent,
  createRuntimeVoiceAgentSpec,
} from '../runtime-voice-agent.js';

describe('createRuntimeVoiceAgentSpec', () => {
  test('deduplicates MCP servers and always includes stallion-control', () => {
    const spec = createRuntimeVoiceAgentSpec([
      { tools: { mcpServers: ['github', 'slack'] } } as any,
      { tools: { mcpServers: ['slack', 'jira'] } } as any,
    ]);

    expect(spec).toEqual({
      name: 'Stallion Voice',
      prompt: expect.stringContaining('hands-free voice assistant'),
      tools: {
        mcpServers: ['stallion-control', 'github', 'slack', 'jira'],
        autoApprove: ['stallion-control_*'],
        available: ['*'],
      },
    });
  });
});

describe('bootstrapRuntimeVoiceAgent', () => {
  test('creates or updates the voice agent and logs loaded tools', async () => {
    const configLoader = {
      agentExists: vi.fn(async () => false),
      createAgent: vi.fn(async () => {}),
      updateAgent: vi.fn(async () => {}),
    };
    const createVoltAgentInstance = vi.fn(async () => ({}));
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };
    const agentTools = new Map([
      ['stallion-voice', [{ name: 'tool-1' }] as any],
    ]);

    await bootstrapRuntimeVoiceAgent({
      agentSpecs: [{ tools: { mcpServers: ['github'] } } as any],
      configLoader,
      createVoltAgentInstance,
      agentTools,
      logger,
    });

    expect(configLoader.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Stallion Voice',
        tools: expect.objectContaining({
          mcpServers: ['stallion-control', 'github'],
        }),
      }),
    );
    expect(createVoltAgentInstance).toHaveBeenCalledWith('stallion-voice');
    expect(logger.info).toHaveBeenCalledWith(
      'Bootstrapped stallion-voice agent',
      expect.objectContaining({
        toolCount: 1,
      }),
    );
  });
});
