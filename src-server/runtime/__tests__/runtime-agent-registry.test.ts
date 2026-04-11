import { describe, expect, test, vi } from 'vitest';
import {
  initializeRuntimeAgents,
  replaceRuntimeAgentMetadataMap,
} from '../runtime-agent-registry.js';

describe('runtime-agent-registry', () => {
  test('replaceRuntimeAgentMetadataMap preserves default metadata on the same map instance', () => {
    const agentMetadataMap = new Map<string, unknown>([
      ['default', { slug: 'default', label: 'Default' }],
      ['old', { slug: 'old', label: 'Old' }],
    ]);
    const logger = { info: vi.fn() };

    replaceRuntimeAgentMetadataMap(
      agentMetadataMap,
      [{ slug: 'writer' }, { slug: 'reviewer' }],
      logger,
    );

    expect(agentMetadataMap).toEqual(
      new Map<string, unknown>([
        ['writer', { slug: 'writer' }],
        ['reviewer', { slug: 'reviewer' }],
        ['default', { slug: 'default', label: 'Default' }],
      ]),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Agent metadata map created',
      expect.objectContaining({
        count: 3,
        sample: { slug: 'writer' },
      }),
    );
  });

  test('initializeRuntimeAgents loads dynamic agents and keeps going after failures', async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const activeAgents = new Map<string, any>();
    const agentMetadataMap = new Map<string, unknown>([
      ['default', { slug: 'default', label: 'Default' }],
    ]);
    const bootstrapDefaultAgent = vi.fn(async () => ({
      default: { id: 'default-agent' },
    }));
    const createVoltAgentInstance = vi
      .fn()
      .mockResolvedValueOnce({ id: 'writer-agent' })
      .mockRejectedValueOnce(new Error('broken'));

    const agents = await initializeRuntimeAgents({
      configLoader: {
        listAgents: async () => [{ slug: 'writer' }, { slug: 'broken' }],
      },
      logger,
      bootstrapDefaultAgent,
      createVoltAgentInstance,
      activeAgents,
      agentMetadataMap,
    });

    expect(agents).toEqual({
      default: { id: 'default-agent' },
      writer: { id: 'writer-agent' },
    });
    expect(activeAgents).toEqual(
      new Map<string, any>([['writer', { id: 'writer-agent' }]]),
    );
    expect(agentMetadataMap).toEqual(
      new Map<string, unknown>([
        ['writer', { slug: 'writer' }],
        ['broken', { slug: 'broken' }],
        ['default', { slug: 'default', label: 'Default' }],
      ]),
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to load agent',
      expect.objectContaining({
        agent: 'broken',
      }),
    );
  });
});
