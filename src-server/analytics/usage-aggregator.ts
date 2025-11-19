import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

export interface UsageStats {
  lifetime: {
    totalMessages: number;
    totalSessions: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    uniqueAgents: string[];
    firstMessageDate?: string;
    lastMessageDate?: string;
  };
  byModel: Record<string, {
    messages: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>;
  byAgent: Record<string, {
    sessions: number;
    messages: number;
    cost: number;
  }>;
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
  { id: 'first-message', name: 'First Steps', description: 'Send your first message', threshold: 1 },
  { id: 'conversationalist', name: 'Conversationalist', description: 'Send 100 messages', threshold: 100 },
  { id: 'power-user', name: 'Power User', description: 'Send 1,000 messages', threshold: 1000 },
  { id: 'model-explorer', name: 'Model Explorer', description: 'Use 5 different models', threshold: 5 },
  { id: 'cost-conscious', name: 'Cost Conscious', description: 'Keep average cost under $0.01/message', threshold: 0.01 },
];

export class UsageAggregator {
  private workAgentDir: string;
  private statsPath: string;
  private achievementsPath: string;

  constructor(workAgentDir: string) {
    this.workAgentDir = workAgentDir;
    this.statsPath = join(workAgentDir, 'analytics', 'stats.json');
    this.achievementsPath = join(workAgentDir, 'analytics', 'achievements.json');
  }

  private async ensureAnalyticsDir(): Promise<void> {
    await mkdir(join(this.workAgentDir, 'analytics'), { recursive: true });
  }

  async loadStats(): Promise<UsageStats> {
    if (existsSync(this.statsPath)) {
      const content = await readFile(this.statsPath, 'utf-8');
      return JSON.parse(content);
    }
    return this.getEmptyStats();
  }

  private getEmptyStats(): UsageStats {
    return {
      lifetime: {
        totalMessages: 0,
        totalSessions: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
        uniqueAgents: [],
      },
      byModel: {},
      byAgent: {},
    };
  }

  async saveStats(stats: UsageStats): Promise<void> {
    await this.ensureAnalyticsDir();
    await writeFile(this.statsPath, JSON.stringify(stats, null, 2), 'utf-8');
  }

  async incrementalUpdate(message: any, agentSlug: string, conversationId: string): Promise<void> {
    const stats = await this.loadStats();
    const usage = message.metadata?.usage;
    const modelId = message.metadata?.model || 'unknown';

    // Update lifetime stats
    stats.lifetime.totalMessages++;
    if (usage) {
      stats.lifetime.totalInputTokens += usage.inputTokens || 0;
      stats.lifetime.totalOutputTokens += usage.outputTokens || 0;
      stats.lifetime.totalCost += usage.estimatedCost || 0;
    }

    const timestamp = message.metadata?.timestamp;
    if (timestamp) {
      const date = new Date(timestamp).toISOString().split('T')[0];
      if (!stats.lifetime.firstMessageDate || date < stats.lifetime.firstMessageDate) {
        stats.lifetime.firstMessageDate = date;
      }
      if (!stats.lifetime.lastMessageDate || date > stats.lifetime.lastMessageDate) {
        stats.lifetime.lastMessageDate = date;
      }
    }

    if (!stats.lifetime.uniqueAgents.includes(agentSlug)) {
      stats.lifetime.uniqueAgents.push(agentSlug);
    }

    // Update by-model stats
    if (!stats.byModel[modelId]) {
      stats.byModel[modelId] = { messages: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
    }
    stats.byModel[modelId].messages++;
    if (usage) {
      stats.byModel[modelId].inputTokens += usage.inputTokens || 0;
      stats.byModel[modelId].outputTokens += usage.outputTokens || 0;
      stats.byModel[modelId].cost += usage.estimatedCost || 0;
    }

    // Update by-agent stats
    if (!stats.byAgent[agentSlug]) {
      stats.byAgent[agentSlug] = { sessions: 0, messages: 0, cost: 0 };
    }
    stats.byAgent[agentSlug].messages++;
    if (usage) {
      stats.byAgent[agentSlug].cost += usage.estimatedCost || 0;
    }

    await this.saveStats(stats);
    await this.updateAchievements(stats);
  }

  async fullRescan(): Promise<UsageStats> {
    const stats = this.getEmptyStats();
    const agentsDir = join(this.workAgentDir, 'agents');
    
    if (!existsSync(agentsDir)) {
      await this.saveStats(stats);
      return stats;
    }

    const agents = await readdir(agentsDir, { withFileTypes: true });
    const sessionCounts = new Map<string, Set<string>>();

    // Load app config to get default model
    const appConfigPath = join(this.workAgentDir, 'config', 'app.json');
    let defaultModel = 'unknown';
    try {
      if (existsSync(appConfigPath)) {
        const appConfig = JSON.parse(await readFile(appConfigPath, 'utf-8'));
        defaultModel = appConfig.defaultModel || 'unknown';
      }
    } catch (error) {
      console.error('Failed to load app config:', error);
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
        console.error(`Failed to load agent spec for ${agentSlug}:`, error);
      }

      const sessionsDir = join(agentsDir, agentSlug, 'memory', 'sessions');
      
      if (!existsSync(sessionsDir)) continue;

      const sessionFiles = await readdir(sessionsDir);
      sessionCounts.set(agentSlug, new Set(sessionFiles.map(f => f.replace('.ndjson', ''))));

      for (const file of sessionFiles) {
        if (!file.endsWith('.ndjson')) continue;
        const conversationId = file.replace('.ndjson', '');
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

            stats.lifetime.totalMessages++;
            if (usage) {
              stats.lifetime.totalInputTokens += usage.inputTokens || 0;
              stats.lifetime.totalOutputTokens += usage.outputTokens || 0;
              stats.lifetime.totalCost += usage.estimatedCost || 0;
            }

            if (timestamp) {
              const date = new Date(timestamp).toISOString().split('T')[0];
              if (!stats.lifetime.firstMessageDate || date < stats.lifetime.firstMessageDate) {
                stats.lifetime.firstMessageDate = date;
              }
              if (!stats.lifetime.lastMessageDate || date > stats.lifetime.lastMessageDate) {
                stats.lifetime.lastMessageDate = date;
              }
            }

            if (!stats.byModel[modelId]) {
              stats.byModel[modelId] = { messages: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
            }
            stats.byModel[modelId].messages++;
            if (usage) {
              stats.byModel[modelId].inputTokens += usage.inputTokens || 0;
              stats.byModel[modelId].outputTokens += usage.outputTokens || 0;
              stats.byModel[modelId].cost += usage.estimatedCost || 0;
            }

            if (!stats.byAgent[agentSlug]) {
              stats.byAgent[agentSlug] = { sessions: 0, messages: 0, cost: 0 };
            }
            stats.byAgent[agentSlug].messages++;
            if (usage) {
              stats.byAgent[agentSlug].cost += usage.estimatedCost || 0;
            }
          } catch (error) {
            console.error(`Failed to parse message in ${file}:`, error);
          }
        }
      }
    }

    stats.lifetime.uniqueAgents = Array.from(sessionCounts.keys());
    stats.lifetime.totalSessions = Array.from(sessionCounts.values()).reduce((sum, set) => sum + set.size, 0);

    for (const [agent, sessions] of sessionCounts) {
      if (stats.byAgent[agent]) {
        stats.byAgent[agent].sessions = sessions.size;
      }
    }

    await this.saveStats(stats);
    await this.updateAchievements(stats);
    return stats;
  }

  async getAchievements(): Promise<Achievement[]> {
    const stats = await this.loadStats();
    const saved = existsSync(this.achievementsPath)
      ? JSON.parse(await readFile(this.achievementsPath, 'utf-8'))
      : {};

    return ACHIEVEMENTS.map(def => {
      const unlocked = this.checkAchievement(def, stats);
      const existing = saved[def.id];
      
      return {
        ...def,
        unlocked,
        unlockedAt: unlocked && !existing?.unlocked ? new Date().toISOString() : existing?.unlockedAt,
        progress: this.getProgress(def, stats),
      };
    });
  }

  private checkAchievement(def: typeof ACHIEVEMENTS[0], stats: UsageStats): boolean {
    switch (def.id) {
      case 'first-message':
      case 'conversationalist':
      case 'power-user':
        return stats.lifetime.totalMessages >= def.threshold!;
      case 'model-explorer':
        return Object.keys(stats.byModel).length >= def.threshold!;
      case 'cost-conscious':
        return stats.lifetime.totalMessages > 0 &&
          (stats.lifetime.totalCost / stats.lifetime.totalMessages) <= def.threshold!;
      default:
        return false;
    }
  }

  private getProgress(def: typeof ACHIEVEMENTS[0], stats: UsageStats): number {
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

  private async updateAchievements(stats: UsageStats): Promise<void> {
    const achievements = await this.getAchievements();
    const saved: Record<string, any> = {};
    
    for (const achievement of achievements) {
      saved[achievement.id] = {
        unlocked: achievement.unlocked,
        unlockedAt: achievement.unlockedAt,
      };
    }

    await this.ensureAnalyticsDir();
    await writeFile(this.achievementsPath, JSON.stringify(saved, null, 2), 'utf-8');
  }
}
