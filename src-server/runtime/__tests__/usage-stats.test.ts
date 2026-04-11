import { describe, expect, it, vi } from 'vitest';
import {
  buildConversationStatsUpdate,
  calculateContextWindowPercentage,
  calculateUsageCost,
  createEmptyConversationStats,
  getMessageTextContent,
} from '../usage-stats.js';

describe('usage-stats', () => {
  it('builds updated conversation stats from prior state', () => {
    const existingStats = {
      ...createEmptyConversationStats(),
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      contextTokens: 170,
      turns: 2,
      toolCalls: 1,
      estimatedCost: 1.5,
      tokenBreakdown: {
        systemPromptTokens: 20,
        mcpServerTokens: 10,
        userMessageTokens: 40,
        assistantMessageTokens: 50,
      },
    };

    const { updatedStats, modelStats } = buildConversationStatsUpdate({
      existingStats,
      existingModelStats: {
        'anthropic.claude': existingStats,
      },
      usage: {
        promptTokens: 25,
        completionTokens: 15,
      },
      toolCallCount: 2,
      modelId: 'anthropic.claude',
      latestUserMessageText: 'hello there',
      fixedTokens: {
        systemPromptTokens: 20,
        mcpServerTokens: 10,
      },
      cost: 0.2,
    });

    expect(updatedStats).toEqual({
      inputTokens: 125,
      outputTokens: 65,
      totalTokens: 190,
      contextTokens: 138,
      turns: 3,
      toolCalls: 3,
      estimatedCost: 1.7,
      tokenBreakdown: {
        systemPromptTokens: 20,
        mcpServerTokens: 10,
        userMessageTokens: 43,
        assistantMessageTokens: 65,
      },
    });
    expect(modelStats['anthropic.claude']).toEqual({
      inputTokens: 125,
      outputTokens: 65,
      totalTokens: 190,
      contextTokens: 138,
      turns: 3,
      toolCalls: 3,
      estimatedCost: 1.7,
      tokenBreakdown: {
        systemPromptTokens: 20,
        mcpServerTokens: 10,
        userMessageTokens: 43,
        assistantMessageTokens: 65,
      },
    });
  });

  it('extracts text content from supported message shapes', () => {
    expect(
      getMessageTextContent({
        parts: [
          { type: 'text', text: 'hello' },
          { type: 'image', text: 'ignored' },
          { type: 'text', text: ' world' },
        ],
      }),
    ).toBe('hello world');
    expect(
      getMessageTextContent({
        content: [{ text: 'alpha' }, { text: 'beta' }],
      }),
    ).toBe('alphabeta');
    expect(getMessageTextContent({ content: 'plain text' })).toBe('plain text');
  });

  it('calculates context window percentage with the shared default window', () => {
    expect(calculateContextWindowPercentage('any-model', 50_000)).toBe(25);
  });

  it('calculates usage cost from model pricing', async () => {
    const logger = { warn: vi.fn() };
    const modelCatalog = {
      getModelPricing: vi.fn().mockResolvedValue([
        {
          modelId: 'Claude 4 Sonnet',
          inputTokenPrice: 0.003,
          outputTokenPrice: 0.015,
        },
      ]),
    };

    const cost = await calculateUsageCost(
      'claude-4-sonnet',
      { promptTokens: 1000, completionTokens: 500 },
      modelCatalog as any,
      { region: 'us-west-2' } as any,
      logger,
    );

    expect(cost).toBeCloseTo(0.0105, 10);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
