import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ name: 'usage-aggregator' });

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

const ACHIEVEMENTS = [
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
];

export class UsageAggregator {
  private projectHomeDir: string;
  private statsPath: string;
  private achievementsPath: string;

  constructor(projectHomeDir: string) {
    this.projectHomeDir = projectHomeDir;
    this.statsPath = join(projectHomeDir, 'analytics', 'stats.json');
    this.achievementsPath = join(
      projectHomeDir,
      'analytics',
      'achievements.json',
    );
  }

  private async ensureAnalyticsDir(): Promise<void> {
    await mkdir(join(this.projectHomeDir, 'analytics'), { recursive: true });
  }

  async loadStats(): Promise<UsageStats> {
    if (existsSync(this.statsPath)) {
      const content = await readFile(this.statsPath, 'utf-8');
      const stats = JSON.parse(content);
      // Clean up legacy "unknown" model bucket
      delete stats.byModel?.['unknown'];
      return stats;
    }
    return this.getEmptyStats();
  }

  private getEmptyStats(): UsageStats {
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

  async saveStats(stats: UsageStats): Promise<void> {
    await this.ensureAnalyticsDir();
    // Compute streak + daysActive from byDate
    this.computeStreakStats(stats);
    await writeFile(this.statsPath, JSON.stringify(stats, null, 2), 'utf-8');
  }

  async reset(): Promise<void> {
    if (existsSync(this.statsPath)) {
      await writeFile(this.statsPath, '{}', 'utf-8');
    }
  }

  private updateDaily(
    stats: UsageStats,
    date: string,
    agentSlug: string,
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      estimatedCost?: number;
    },
  ) {
    if (!stats.byDate) stats.byDate = {};
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

  private computeStreakStats(stats: UsageStats) {
    const dates = Object.keys(stats.byDate || {}).sort();
    stats.lifetime.daysActive = dates.length;
    if (!dates.length) {
      stats.lifetime.streak = 0;
      return;
    }
    // Compute current streak from today backwards
    const today = new Date().toISOString().split('T')[0];
    let streak = 0;
    const d = new Date(today);
    while (true) {
      const key = d.toISOString().split('T')[0];
      if (stats.byDate[key]) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else break;
    }
    stats.lifetime.streak = streak;
  }

  async incrementalUpdate(
    message: any,
    agentSlug: string,
    _conversationId: string,
  ): Promise<void> {
    const stats = await this.loadStats();
    const usage = message.metadata?.usage;
    const modelId = message.metadata?.model;

    // Update lifetime stats
    stats.lifetime.totalMessages++;
    if (usage) {
      stats.lifetime.totalInputTokens += usage.inputTokens || 0;
      stats.lifetime.totalOutputTokens += usage.outputTokens || 0;
      stats.lifetime.totalCost += usage.estimatedCost || 0;
    }

    const timestamp = message.metadata?.timestamp;
    const date = timestamp
      ? new Date(timestamp).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    if (
      !stats.lifetime.firstMessageDate ||
      date < stats.lifetime.firstMessageDate
    ) {
      stats.lifetime.firstMessageDate = date;
    }
    if (
      !stats.lifetime.lastMessageDate ||
      date > stats.lifetime.lastMessageDate
    ) {
      stats.lifetime.lastMessageDate = date;
    }
    this.updateDaily(stats, date, agentSlug, usage);

    if (!stats.lifetime.uniqueAgents.includes(agentSlug)) {
      stats.lifetime.uniqueAgents.push(agentSlug);
    }

    // Update by-model stats (skip if no model ID)
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

    // Update by-agent stats
    if (!stats.byAgent[agentSlug]) {
      stats.byAgent[agentSlug] = { conversations: 0, messages: 0, cost: 0 };
    }
    stats.byAgent[agentSlug].messages++;
    if (usage) {
      stats.byAgent[agentSlug].cost += usage.estimatedCost || 0;
    }

    await this.saveStats(stats);
    await this.updateAchievements(stats);
  }

  async fullRescan(): Promise<UsageStats> {
    // Load existing stats instead of starting from zero
    const stats = await this.loadStats();
    const agentsDir = join(this.projectHomeDir, 'agents');

    if (!existsSync(agentsDir)) {
      await this.saveStats(stats);
      return stats;
    }

    // Track what we've seen in current files
    const _seenMessages = new Set<string>();
    const currentStats = this.getEmptyStats();

    const agents = await readdir(agentsDir, { withFileTypes: true });
    const sessionCounts = new Map<string, Set<string>>();

    // Load app config to get default model
    const appConfigPath = join(this.projectHomeDir, 'config', 'app.json');
    let defaultModel = '';
    try {
      if (existsSync(appConfigPath)) {
        const appConfig = JSON.parse(await readFile(appConfigPath, 'utf-8'));
        defaultModel = appConfig.defaultModel || '';
      }
    } catch (error) {
      logger.error('Failed to load app config', { error });
    }

    for (const agent of agents) {
      if (!agent.isDirectory()) continue;
      const agentSlug = agent.name;

      // Load agent spec to get model
      const agentJsonPath = join(agentsDir, agentSlug, 'agent.json');
      let agentModel = defaultModel;
      try {
        if (existsSync(agentJsonPath)) {
          const agentSpec = JSON.parse(await readFile(agentJsonPath, 'utf-8'));
          agentModel = agentSpec.model || defaultModel;
        }
      } catch (error) {
        logger.error('Failed to load agent spec', { agentSlug, error });
      }

      const sessionsDir = join(agentsDir, agentSlug, 'memory', 'sessions');

      if (!existsSync(sessionsDir)) continue;

      const sessionFiles = await readdir(sessionsDir);
      sessionCounts.set(
        agentSlug,
        new Set(sessionFiles.map((f) => f.replace('.ndjson', ''))),
      );

      for (const file of sessionFiles) {
        if (!file.endsWith('.ndjson')) continue;
        const _conversationId = file.replace('.ndjson', '');
        const filePath = join(sessionsDir, file);

        const stream = createReadStream(filePath, 'utf-8');
        const rl = createInterface({ input: stream, crlfDelay: Infinity });

        for await (const line of rl) {
          if (!line.trim()) continue;
          try {
            const message = JSON.parse(line);
            const usage = message.metadata?.usage;
            const modelId = message.metadata?.model || agentModel;
            const timestamp = message.metadata?.timestamp;

            currentStats.lifetime.totalMessages++;
            if (usage) {
              currentStats.lifetime.totalInputTokens += usage.inputTokens || 0;
              currentStats.lifetime.totalOutputTokens +=
                usage.outputTokens || 0;
              currentStats.lifetime.totalCost += usage.estimatedCost || 0;
            }

            if (timestamp) {
              const date = new Date(timestamp).toISOString().split('T')[0];
              if (
                !currentStats.lifetime.firstMessageDate ||
                date < currentStats.lifetime.firstMessageDate
              ) {
                currentStats.lifetime.firstMessageDate = date;
              }
              if (
                !currentStats.lifetime.lastMessageDate ||
                date > currentStats.lifetime.lastMessageDate
              ) {
                currentStats.lifetime.lastMessageDate = date;
              }
              this.updateDaily(currentStats, date, agentSlug, usage);
            }

            if (modelId) {
              if (!currentStats.byModel[modelId]) {
                currentStats.byModel[modelId] = {
                  messages: 0,
                  inputTokens: 0,
                  outputTokens: 0,
                  cost: 0,
                };
              }
              currentStats.byModel[modelId].messages++;
              if (usage) {
                currentStats.byModel[modelId].inputTokens +=
                  usage.inputTokens || 0;
                currentStats.byModel[modelId].outputTokens +=
                  usage.outputTokens || 0;
                currentStats.byModel[modelId].cost += usage.estimatedCost || 0;
              }
            }

            if (!currentStats.byAgent[agentSlug]) {
              currentStats.byAgent[agentSlug] = {
                conversations: 0,
                messages: 0,
                cost: 0,
              };
            }
            currentStats.byAgent[agentSlug].messages++;
            if (usage) {
              currentStats.byAgent[agentSlug].cost += usage.estimatedCost || 0;
            }
          } catch (error) {
            logger.error('Failed to parse message', { file, error });
          }
        }
      }
    }

    currentStats.lifetime.uniqueAgents = Array.from(sessionCounts.keys());
    currentStats.lifetime.totalConversations = Array.from(
      sessionCounts.values(),
    ).reduce((sum, set) => sum + set.size, 0);

    for (const [agent, sessions] of sessionCounts) {
      if (currentStats.byAgent[agent]) {
        currentStats.byAgent[agent].conversations = sessions.size;
      }
    }

    // Merge: keep the higher values (existing stats may include deleted conversations)
    stats.lifetime.totalMessages = Math.max(
      stats.lifetime.totalMessages,
      currentStats.lifetime.totalMessages,
    );
    stats.lifetime.totalConversations = Math.max(
      stats.lifetime.totalConversations,
      currentStats.lifetime.totalConversations,
    );
    stats.lifetime.totalInputTokens = Math.max(
      stats.lifetime.totalInputTokens,
      currentStats.lifetime.totalInputTokens,
    );
    stats.lifetime.totalOutputTokens = Math.max(
      stats.lifetime.totalOutputTokens,
      currentStats.lifetime.totalOutputTokens,
    );
    stats.lifetime.totalCost = Math.max(
      stats.lifetime.totalCost,
      currentStats.lifetime.totalCost,
    );

    // Merge unique agents
    const allAgents = new Set([
      ...stats.lifetime.uniqueAgents,
      ...currentStats.lifetime.uniqueAgents,
    ]);
    stats.lifetime.uniqueAgents = Array.from(allAgents);

    // Keep earliest first date and latest last date
    if (currentStats.lifetime.firstMessageDate) {
      if (
        !stats.lifetime.firstMessageDate ||
        currentStats.lifetime.firstMessageDate < stats.lifetime.firstMessageDate
      ) {
        stats.lifetime.firstMessageDate =
          currentStats.lifetime.firstMessageDate;
      }
    }
    if (currentStats.lifetime.lastMessageDate) {
      if (
        !stats.lifetime.lastMessageDate ||
        currentStats.lifetime.lastMessageDate > stats.lifetime.lastMessageDate
      ) {
        stats.lifetime.lastMessageDate = currentStats.lifetime.lastMessageDate;
      }
    }

    // Merge by-model stats (keep higher values)
    for (const [modelId, modelStats] of Object.entries(currentStats.byModel)) {
      if (!stats.byModel[modelId]) {
        stats.byModel[modelId] = modelStats;
      } else {
        stats.byModel[modelId].messages = Math.max(
          stats.byModel[modelId].messages,
          modelStats.messages,
        );
        stats.byModel[modelId].inputTokens = Math.max(
          stats.byModel[modelId].inputTokens,
          modelStats.inputTokens,
        );
        stats.byModel[modelId].outputTokens = Math.max(
          stats.byModel[modelId].outputTokens,
          modelStats.outputTokens,
        );
        stats.byModel[modelId].cost = Math.max(
          stats.byModel[modelId].cost,
          modelStats.cost,
        );
      }
    }

    // Merge by-agent stats (keep higher values)
    for (const [agentSlug, agentStats] of Object.entries(
      currentStats.byAgent,
    )) {
      if (!stats.byAgent[agentSlug]) {
        stats.byAgent[agentSlug] = agentStats;
      } else {
        stats.byAgent[agentSlug].conversations = Math.max(
          stats.byAgent[agentSlug].conversations || 0,
          agentStats.conversations || 0,
        );
        stats.byAgent[agentSlug].messages = Math.max(
          stats.byAgent[agentSlug].messages,
          agentStats.messages,
        );
        stats.byAgent[agentSlug].cost = Math.max(
          stats.byAgent[agentSlug].cost,
          agentStats.cost,
        );
      }
    }

    // byDate: rescan is authoritative
    stats.byDate = currentStats.byDate;

    await this.saveStats(stats);
    await this.updateAchievements(stats);
    return stats;
  }

  async getAchievements(): Promise<Achievement[]> {
    const stats = await this.loadStats();
    const saved = existsSync(this.achievementsPath)
      ? JSON.parse(await readFile(this.achievementsPath, 'utf-8'))
      : {};

    return ACHIEVEMENTS.map((def) => {
      const unlocked = this.checkAchievement(def, stats);
      const existing = saved[def.id];

      return {
        ...def,
        unlocked,
        unlockedAt:
          unlocked && !existing?.unlocked
            ? new Date().toISOString()
            : existing?.unlockedAt,
        progress: this.getProgress(def, stats),
      };
    });
  }

  private checkAchievement(
    def: (typeof ACHIEVEMENTS)[0],
    stats: UsageStats,
  ): boolean {
    switch (def.id) {
      case 'first-message':
      case 'conversationalist':
      case 'power-user':
        return stats.lifetime.totalMessages >= def.threshold!;
      case 'model-explorer':
        return Object.keys(stats.byModel).length >= def.threshold!;
      case 'cost-conscious':
        return (
          stats.lifetime.totalMessages >= 50 &&
          stats.lifetime.totalCost / stats.lifetime.totalMessages <=
            def.threshold!
        );
      default:
        return false;
    }
  }

  private getProgress(
    def: (typeof ACHIEVEMENTS)[0],
    stats: UsageStats,
  ): number {
    switch (def.id) {
      case 'first-message':
      case 'conversationalist':
      case 'power-user':
        return Math.min(stats.lifetime.totalMessages, def.threshold!);
      case 'model-explorer':
        return Math.min(Object.keys(stats.byModel).length, def.threshold!);
      case 'cost-conscious':
        return stats.lifetime.totalMessages > 0
          ? stats.lifetime.totalCost / stats.lifetime.totalMessages
          : 0;
      default:
        return 0;
    }
  }

  private async updateAchievements(_stats: UsageStats): Promise<void> {
    const achievements = await this.getAchievements();
    const saved: Record<string, any> = {};

    for (const achievement of achievements) {
      saved[achievement.id] = {
        unlocked: achievement.unlocked,
        unlockedAt: achievement.unlockedAt,
      };
    }

    await this.ensureAnalyticsDir();
    await writeFile(
      this.achievementsPath,
      JSON.stringify(saved, null, 2),
      'utf-8',
    );
  }
}
