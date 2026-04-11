import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import {
  ACHIEVEMENTS,
  type Achievement,
  applyMessageToUsageStats,
  checkAchievement,
  computeStreakStats,
  createEmptyUsageStats,
  getAchievementProgress,
  mergeRescannedUsageStats,
  type UsageStats,
} from './usage-aggregator-state.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ name: 'usage-aggregator' });

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
      delete stats.byModel?.unknown;
      return stats;
    }
    return createEmptyUsageStats();
  }

  async saveStats(stats: UsageStats): Promise<void> {
    await this.ensureAnalyticsDir();
    // Compute streak + daysActive from byDate
    computeStreakStats(stats);
    await writeFile(this.statsPath, JSON.stringify(stats, null, 2), 'utf-8');
  }

  async reset(): Promise<void> {
    if (existsSync(this.statsPath)) {
      await writeFile(this.statsPath, '{}', 'utf-8');
    }
  }

  async incrementalUpdate(
    message: any,
    agentSlug: string,
    _conversationId: string,
  ): Promise<void> {
    const stats = await this.loadStats();
    applyMessageToUsageStats(stats, message, agentSlug);

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
    const currentStats = createEmptyUsageStats();

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
            applyMessageToUsageStats(currentStats, message, agentSlug, agentModel);
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

    mergeRescannedUsageStats(stats, currentStats);

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
    def: (typeof ACHIEVEMENTS)[number],
    stats: UsageStats,
  ): boolean {
    return checkAchievement(def, stats);
  }

  private getProgress(
    def: (typeof ACHIEVEMENTS)[number],
    stats: UsageStats,
  ): number {
    return getAchievementProgress(def, stats);
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
