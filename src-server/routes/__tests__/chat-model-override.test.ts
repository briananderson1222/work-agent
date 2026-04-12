import { describe, expect, test, vi } from 'vitest';
import { resolveChatAgentModelOverride } from '../chat-model-override.js';

describe('chat-model-override helpers', () => {
  test('returns a validation error for invalid model overrides', async () => {
    const result = await resolveChatAgentModelOverride({
      ctx: {
        modelCatalog: {
          validateModelId: vi.fn().mockResolvedValue(false),
        },
        logger: {
          warn: vi.fn(),
          info: vi.fn(),
          error: vi.fn(),
        },
      } as any,
      slug: 'writer',
      modelOverride: 'bad-model',
      agent: { id: 'writer' },
    });

    expect(result).toEqual({
      agent: { id: 'writer' },
      status: 400,
      error:
        'Invalid model ID: bad-model. Please select a valid model from the list.',
    });
  });

  test('creates and caches a temp agent for a valid model override', async () => {
    const tempAgent = { id: 'writer:alt' };
    const activeAgents = new Map<string, any>();
    const createTempAgent = vi.fn().mockResolvedValue({ raw: tempAgent });
    const createBedrockModel = vi
      .fn()
      .mockResolvedValue({ id: 'resolved-model' });
    const logger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };

    const result = await resolveChatAgentModelOverride({
      ctx: {
        activeAgents,
        agentSpecs: new Map([['writer', { region: 'us-west-2' }]]),
        agentTools: new Map([['writer', [{ name: 'tool-a' }]]]),
        appConfig: { region: 'us-east-1' },
        modelCatalog: {
          validateModelId: vi.fn().mockResolvedValue(true),
          resolveModelId: vi.fn().mockResolvedValue('resolved-model-id'),
        },
        createBedrockModel,
        framework: { createTempAgent },
        logger,
      } as any,
      slug: 'writer',
      modelOverride: 'sonnet',
      agent: { id: 'writer', instructions: 'Be helpful' },
    });

    expect(result).toEqual({ agent: tempAgent });
    expect(createBedrockModel).toHaveBeenCalledWith({
      model: 'resolved-model-id',
      region: 'us-west-2',
    });
    expect(createTempAgent).toHaveBeenCalledWith({
      name: 'writer:sonnet',
      instructions: 'Be helpful',
      model: { id: 'resolved-model' },
      tools: [{ name: 'tool-a' }],
    });
    expect(activeAgents.get('writer:sonnet')).toBe(tempAgent);
    expect(logger.info).toHaveBeenCalledWith(
      'Created agent with model override',
      {
        slug: 'writer',
        modelOverride: 'sonnet',
      },
    );
  });
});
