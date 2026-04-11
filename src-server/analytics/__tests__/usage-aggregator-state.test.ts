import { describe, expect, test } from 'vitest';
import {
  ACHIEVEMENTS,
  applyMessageToUsageStats,
  checkAchievement,
  computeStreakStats,
  createEmptyUsageStats,
  getAchievementProgress,
  mergeRescannedUsageStats,
} from '../usage-aggregator-state.js';

describe('applyMessageToUsageStats', () => {
  test('updates lifetime, model, agent, and daily buckets', () => {
    const stats = createEmptyUsageStats();

    applyMessageToUsageStats(
      stats,
      {
        metadata: {
          model: 'claude-sonnet',
          timestamp: '2026-04-11T10:00:00.000Z',
          usage: { inputTokens: 10, outputTokens: 20, estimatedCost: 0.5 },
        },
      },
      'agent-a',
    );

    expect(stats).toEqual({
      lifetime: {
        totalMessages: 1,
        totalConversations: 0,
        totalInputTokens: 10,
        totalOutputTokens: 20,
        totalCost: 0.5,
        uniqueAgents: ['agent-a'],
        firstMessageDate: '2026-04-11',
        lastMessageDate: '2026-04-11',
      },
      byModel: {
        'claude-sonnet': {
          messages: 1,
          inputTokens: 10,
          outputTokens: 20,
          cost: 0.5,
        },
      },
      byAgent: {
        'agent-a': {
          conversations: 0,
          messages: 1,
          cost: 0.5,
        },
      },
      byDate: {
        '2026-04-11': {
          messages: 1,
          cost: 0.5,
          inputTokens: 10,
          outputTokens: 20,
          byAgent: { 'agent-a': 1 },
        },
      },
    });
  });
});

describe('mergeRescannedUsageStats', () => {
  test('keeps max lifetime totals and authoritative byDate data', () => {
    const existing = createEmptyUsageStats();
    existing.lifetime.totalMessages = 5;
    existing.lifetime.uniqueAgents = ['agent-a'];
    existing.byDate = { '2026-04-10': { messages: 5, cost: 1, inputTokens: 1, outputTokens: 1, byAgent: { 'agent-a': 5 } } };

    const rescanned = createEmptyUsageStats();
    rescanned.lifetime.totalMessages = 3;
    rescanned.lifetime.totalConversations = 2;
    rescanned.lifetime.uniqueAgents = ['agent-b'];
    rescanned.byAgent['agent-b'] = { conversations: 2, messages: 3, cost: 0.2 };
    rescanned.byDate = { '2026-04-11': { messages: 3, cost: 0.2, inputTokens: 2, outputTokens: 3, byAgent: { 'agent-b': 3 } } };

    const merged = mergeRescannedUsageStats(existing, rescanned);

    expect(merged.lifetime.totalMessages).toBe(5);
    expect(merged.lifetime.totalConversations).toBe(2);
    expect(merged.lifetime.uniqueAgents.sort()).toEqual(['agent-a', 'agent-b']);
    expect(merged.byDate).toEqual(rescanned.byDate);
  });
});

describe('achievement helpers', () => {
  test('compute streak stats and achievement progress', () => {
    const stats = createEmptyUsageStats();
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    stats.byDate[today] = {
      messages: 1,
      cost: 0,
      inputTokens: 0,
      outputTokens: 0,
      byAgent: {},
    };
    stats.byDate[yesterday] = {
      messages: 1,
      cost: 0,
      inputTokens: 0,
      outputTokens: 0,
      byAgent: {},
    };
    stats.lifetime.totalMessages = 120;
    stats.byModel.a = { messages: 100, inputTokens: 1, outputTokens: 1, cost: 0.2 };
    stats.byModel.b = { messages: 20, inputTokens: 1, outputTokens: 1, cost: 0.2 };
    stats.byModel.c = { messages: 1, inputTokens: 1, outputTokens: 1, cost: 0.2 };
    stats.byModel.d = { messages: 1, inputTokens: 1, outputTokens: 1, cost: 0.2 };
    stats.byModel.e = { messages: 1, inputTokens: 1, outputTokens: 1, cost: 0.2 };
    stats.lifetime.totalCost = 0.5;

    computeStreakStats(stats);

    expect(stats.lifetime.daysActive).toBe(2);
    expect(stats.lifetime.streak).toBeGreaterThanOrEqual(1);
    expect(checkAchievement(ACHIEVEMENTS[1], stats)).toBe(true);
    expect(checkAchievement(ACHIEVEMENTS[3], stats)).toBe(true);
    expect(getAchievementProgress(ACHIEVEMENTS[1], stats)).toBe(100);
  });
});
