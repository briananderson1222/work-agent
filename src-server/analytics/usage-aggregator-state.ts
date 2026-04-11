export interface DailyStats {
  messages: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  byAgent: Record<string, number>;
}

export interface UsageStats {
  lifetime: {
    totalMessages: number;
    totalConversations: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    uniqueAgents: string[];
    firstMessageDate?: string;
    lastMessageDate?: string;
    streak?: number;
    daysActive?: number;
  };
  byModel: Record<
    string,
    {
      messages: number;
      inputTokens: number;
      outputTokens: number;
      cost: number;
    }
  >;
  byAgent: Record<
    string,
    {
      conversations: number;
      messages: number;
      cost: number;
    }
  >;
  byDate: Record<string, DailyStats>;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
  progress?: number;
  threshold?: number;
}

export const ACHIEVEMENTS = [
  {
    id: 'first-message',
    name: 'First Steps',
    description: 'Send your first message',
    threshold: 1,
  },
  {
    id: 'conversationalist',
    name: 'Conversationalist',
    description: 'Send 100 messages',
    threshold: 100,
  },
  {
    id: 'power-user',
    name: 'Power User',
    description: 'Send 1,000 messages',
    threshold: 1000,
  },
  {
    id: 'model-explorer',
    name: 'Model Explorer',
    description: 'Use 5 different models',
    threshold: 5,
  },
  {
    id: 'cost-conscious',
    name: 'Cost Conscious',
    description: 'Keep average cost under $0.01/message',
    threshold: 0.01,
  },
] as const;

interface UsageLike {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
}

interface MessageLike {
  metadata?: {
    usage?: UsageLike;
    model?: string;
    timestamp?: string;
  };
}

export function createEmptyUsageStats(): UsageStats {
  return {
    lifetime: {
      totalMessages: 0,
      totalConversations: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      uniqueAgents: [],
    },
    byModel: {},
    byAgent: {},
    byDate: {},
  };
}

export function updateDailyUsage(
  stats: UsageStats,
  date: string,
  agentSlug: string,
  usage?: UsageLike,
): void {
  if (!stats.byDate[date]) {
    stats.byDate[date] = {
      messages: 0,
      cost: 0,
      inputTokens: 0,
      outputTokens: 0,
      byAgent: {},
    };
  }
  const day = stats.byDate[date];
  day.messages++;
  if (usage) {
    day.inputTokens += usage.inputTokens || 0;
    day.outputTokens += usage.outputTokens || 0;
    day.cost += usage.estimatedCost || 0;
  }
  day.byAgent[agentSlug] = (day.byAgent[agentSlug] || 0) + 1;
}

export function computeStreakStats(stats: UsageStats): void {
  const dates = Object.keys(stats.byDate).sort();
  stats.lifetime.daysActive = dates.length;
  if (!dates.length) {
    stats.lifetime.streak = 0;
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  let streak = 0;
  const current = new Date(today);
  while (true) {
    const key = current.toISOString().split('T')[0];
    if (!stats.byDate[key]) break;
    streak++;
    current.setDate(current.getDate() - 1);
  }
  stats.lifetime.streak = streak;
}

export function applyMessageToUsageStats(
  stats: UsageStats,
  message: MessageLike,
  agentSlug: string,
  fallbackModelId = '',
): void {
  const usage = message.metadata?.usage;
  const modelId = message.metadata?.model || fallbackModelId;
  const timestamp = message.metadata?.timestamp;

  stats.lifetime.totalMessages++;
  if (usage) {
    stats.lifetime.totalInputTokens += usage.inputTokens || 0;
    stats.lifetime.totalOutputTokens += usage.outputTokens || 0;
    stats.lifetime.totalCost += usage.estimatedCost || 0;
  }

  const date = timestamp
    ? new Date(timestamp).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  if (!stats.lifetime.firstMessageDate || date < stats.lifetime.firstMessageDate) {
    stats.lifetime.firstMessageDate = date;
  }
  if (!stats.lifetime.lastMessageDate || date > stats.lifetime.lastMessageDate) {
    stats.lifetime.lastMessageDate = date;
  }
  updateDailyUsage(stats, date, agentSlug, usage);

  if (!stats.lifetime.uniqueAgents.includes(agentSlug)) {
    stats.lifetime.uniqueAgents.push(agentSlug);
  }

  if (modelId) {
    if (!stats.byModel[modelId]) {
      stats.byModel[modelId] = {
        messages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      };
    }
    stats.byModel[modelId].messages++;
    if (usage) {
      stats.byModel[modelId].inputTokens += usage.inputTokens || 0;
      stats.byModel[modelId].outputTokens += usage.outputTokens || 0;
      stats.byModel[modelId].cost += usage.estimatedCost || 0;
    }
  }

  if (!stats.byAgent[agentSlug]) {
    stats.byAgent[agentSlug] = { conversations: 0, messages: 0, cost: 0 };
  }
  stats.byAgent[agentSlug].messages++;
  if (usage) {
    stats.byAgent[agentSlug].cost += usage.estimatedCost || 0;
  }
}

export function mergeRescannedUsageStats(
  existing: UsageStats,
  rescanned: UsageStats,
): UsageStats {
  existing.lifetime.totalMessages = Math.max(
    existing.lifetime.totalMessages,
    rescanned.lifetime.totalMessages,
  );
  existing.lifetime.totalConversations = Math.max(
    existing.lifetime.totalConversations,
    rescanned.lifetime.totalConversations,
  );
  existing.lifetime.totalInputTokens = Math.max(
    existing.lifetime.totalInputTokens,
    rescanned.lifetime.totalInputTokens,
  );
  existing.lifetime.totalOutputTokens = Math.max(
    existing.lifetime.totalOutputTokens,
    rescanned.lifetime.totalOutputTokens,
  );
  existing.lifetime.totalCost = Math.max(
    existing.lifetime.totalCost,
    rescanned.lifetime.totalCost,
  );

  existing.lifetime.uniqueAgents = Array.from(
    new Set([
      ...existing.lifetime.uniqueAgents,
      ...rescanned.lifetime.uniqueAgents,
    ]),
  );

  if (
    rescanned.lifetime.firstMessageDate &&
    (!existing.lifetime.firstMessageDate ||
      rescanned.lifetime.firstMessageDate < existing.lifetime.firstMessageDate)
  ) {
    existing.lifetime.firstMessageDate = rescanned.lifetime.firstMessageDate;
  }
  if (
    rescanned.lifetime.lastMessageDate &&
    (!existing.lifetime.lastMessageDate ||
      rescanned.lifetime.lastMessageDate > existing.lifetime.lastMessageDate)
  ) {
    existing.lifetime.lastMessageDate = rescanned.lifetime.lastMessageDate;
  }

  for (const [modelId, modelStats] of Object.entries(rescanned.byModel)) {
    if (!existing.byModel[modelId]) {
      existing.byModel[modelId] = modelStats;
      continue;
    }
    existing.byModel[modelId].messages = Math.max(
      existing.byModel[modelId].messages,
      modelStats.messages,
    );
    existing.byModel[modelId].inputTokens = Math.max(
      existing.byModel[modelId].inputTokens,
      modelStats.inputTokens,
    );
    existing.byModel[modelId].outputTokens = Math.max(
      existing.byModel[modelId].outputTokens,
      modelStats.outputTokens,
    );
    existing.byModel[modelId].cost = Math.max(
      existing.byModel[modelId].cost,
      modelStats.cost,
    );
  }

  for (const [agentSlug, agentStats] of Object.entries(rescanned.byAgent)) {
    if (!existing.byAgent[agentSlug]) {
      existing.byAgent[agentSlug] = agentStats;
      continue;
    }
    existing.byAgent[agentSlug].conversations = Math.max(
      existing.byAgent[agentSlug].conversations || 0,
      agentStats.conversations || 0,
    );
    existing.byAgent[agentSlug].messages = Math.max(
      existing.byAgent[agentSlug].messages,
      agentStats.messages,
    );
    existing.byAgent[agentSlug].cost = Math.max(
      existing.byAgent[agentSlug].cost,
      agentStats.cost,
    );
  }

  existing.byDate = rescanned.byDate;
  return existing;
}

export function checkAchievement(
  def: (typeof ACHIEVEMENTS)[number],
  stats: UsageStats,
): boolean {
  switch (def.id) {
    case 'first-message':
    case 'conversationalist':
    case 'power-user':
      return stats.lifetime.totalMessages >= def.threshold;
    case 'model-explorer':
      return Object.keys(stats.byModel).length >= def.threshold;
    case 'cost-conscious':
      return (
        stats.lifetime.totalMessages >= 50 &&
        stats.lifetime.totalCost / stats.lifetime.totalMessages <= def.threshold
      );
    default:
      return false;
  }
}

export function getAchievementProgress(
  def: (typeof ACHIEVEMENTS)[number],
  stats: UsageStats,
): number {
  switch (def.id) {
    case 'first-message':
    case 'conversationalist':
    case 'power-user':
      return Math.min(stats.lifetime.totalMessages, def.threshold);
    case 'model-explorer':
      return Math.min(Object.keys(stats.byModel).length, def.threshold);
    case 'cost-conscious':
      return stats.lifetime.totalMessages > 0
        ? stats.lifetime.totalCost / stats.lifetime.totalMessages
        : 0;
    default:
      return 0;
  }
}
