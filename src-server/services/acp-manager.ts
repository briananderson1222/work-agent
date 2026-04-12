import type {
  ACPConnectionConfig,
  ACPStatusValue,
} from '@stallion-ai/contracts/acp';
import type { Context } from 'hono';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import { MonitoringEmitter } from '../monitoring/emitter.js';
import { ACPConnection } from './acp-connection.js';
import {
  addACPManagerConnection,
  getOrCreateACPManagerSession,
  reconnectACPManagerConnection,
  removeACPManagerConnection,
  runACPManagerProbes,
  shutdownACPManager,
  sweepACPManagerIdleSessions,
} from './acp-manager-orchestration.js';
import {
  findACPConfigIdForSlug,
  getACPManagerStatus,
  getACPManagerVirtualAgents,
} from './acp-manager-view.js';
import { ACPProbe } from './acp-probe.js';
import { ApprovalRegistry } from './approval-registry.js';

/**
 * Probe + Session Pool architecture.
 * Probes: periodic connect→discover→disconnect per ACP source. Caches modes/agents.
 * Sessions: per-conversation ACPConnection with own process and CWD. Culled when idle.
 */
export class ACPManager {
  private probes = new Map<string, ACPProbe>();
  private configs = new Map<string, ACPConnectionConfig>();
  private sessions = new Map<string, ACPConnection>();
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private cullTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private approvalRegistry: ApprovalRegistry,
    private logger: any,
    private cwd: string,
    private memoryAdapters?: Map<string, FileMemoryAdapter>,
    private createMemoryAdapter?: (slug: string) => FileMemoryAdapter,
    private usageAggregatorRef?: { get: () => any },
    private eventBus?: {
      emit: (event: string, data?: Record<string, unknown>) => void;
    },
    private monitoringEvents?: import('node:events').EventEmitter,
    private persistEvent?: (event: any) => Promise<void>,
    private monitoringEmitter?: MonitoringEmitter,
  ) {}

  async startAll(configs: ACPConnectionConfig[]): Promise<void> {
    await Promise.all(configs.map((config) => this.addConnection(config)));
    this.probeTimer = setInterval(() => void this.runProbes(), 60_000);
    this.cullTimer = setInterval(() => void this.sweepIdleSessions(), 30_000);
  }

  private async runProbes(): Promise<void> {
    await runACPManagerProbes({
      sessions: this.sessions,
      probes: this.probes,
      eventBus: this.eventBus,
      getVirtualAgentCount: () => this.getVirtualAgents().length,
    });
  }

  private async sweepIdleSessions(): Promise<void> {
    await sweepACPManagerIdleSessions({ sessions: this.sessions });
  }

  async addConnection(config: ACPConnectionConfig): Promise<boolean> {
    return addACPManagerConnection({
      config,
      probes: this.probes,
      configs: this.configs,
      logger: this.logger,
      cwd: this.cwd,
      eventBus: this.eventBus,
      removeConnection: (id) => this.removeConnection(id),
    });
  }

  async removeConnection(id: string): Promise<void> {
    await removeACPManagerConnection({
      id,
      probes: this.probes,
      configs: this.configs,
      sessions: this.sessions,
    });
  }

  async reconnect(id: string): Promise<boolean> {
    return reconnectACPManagerConnection({
      id,
      probes: this.probes,
      eventBus: this.eventBus,
    });
  }

  async shutdown(): Promise<void> {
    const timers = await shutdownACPManager({
      probeTimer: this.probeTimer,
      cullTimer: this.cullTimer,
      sessions: this.sessions,
      probes: this.probes,
      configs: this.configs,
    });
    this.probeTimer = timers.probeTimer;
    this.cullTimer = timers.cullTimer;
  }

  hasAgent(slug: string): boolean {
    return findACPConfigIdForSlug(this.probes, slug) !== undefined;
  }

  getVirtualAgents(): any[] {
    return getACPManagerVirtualAgents(this.probes, this.configs);
  }

  isConnected(): boolean {
    return Array.from(this.probes.values()).some((probe) =>
      probe.isAvailable(),
    );
  }

  getSlashCommands(slug: string): any[] {
    const session = this.findSessionForSlug(slug);
    return session?.getSlashCommands(slug) || [];
  }

  async getCommandOptions(
    slug: string,
    partialCommand: string,
  ): Promise<any[]> {
    const session = this.findSessionForSlug(slug);
    return session?.getCommandOptions(partialCommand) || [];
  }

  async handleChat(
    c: Context,
    slug: string,
    input: any,
    options: any,
    context?: { cwd?: string; conversationId?: string },
  ): Promise<Response> {
    const configId = findACPConfigIdForSlug(this.probes, slug);
    if (!configId) {
      return c.json({ success: false, error: 'ACP agent not found' }, 503);
    }

    const { session } = getOrCreateACPManagerSession({
      configId,
      configs: this.configs,
      sessions: this.sessions,
      options,
      context,
      createSession: ({ config, conversationId, cwd }) =>
        new ACPConnection(
          config,
          this.approvalRegistry,
          this.logger,
          cwd,
          conversationId,
          this.memoryAdapters,
          this.createMemoryAdapter,
          this.usageAggregatorRef,
          this.eventBus,
          this.monitoringEvents,
          this.persistEvent,
          this.monitoringEmitter,
        ),
    });

    return session.handleChat(c, slug, input, options, context);
  }

  getStatus(): {
    connections: Array<{
      id: string;
      name: string;
      icon?: string;
      status: ACPStatusValue;
      modes: string[];
      sessionId: null;
      mcpServers: string[];
      configOptions: any[];
      currentModel: string | null;
    }>;
    activeSessions: number;
  } {
    return getACPManagerStatus(this.probes, this.configs, this.sessions.size);
  }

  private findSessionForSlug(slug: string): ACPConnection | undefined {
    return Array.from(this.sessions.values()).find((session) =>
      session.hasAgent(slug),
    );
  }
}
