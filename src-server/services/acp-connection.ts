import type { ChildProcess } from 'node:child_process';
import {
  type Client,
  type ClientSideConnection,
  type SessionNotification,
} from '@agentclientprotocol/sdk';
import {
  ACPStatus,
  type ACPConnectionConfig,
  type ACPStatusValue,
} from '@stallion-ai/contracts/acp';
import type { Context } from 'hono';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import { MonitoringEmitter } from '../monitoring/emitter.js';
import { getCachedUser } from '../routes/auth.js';
import { acpOps } from '../telemetry/metrics.js';
import { ApprovalRegistry } from './approval-registry.js';
import { prepareACPChatTurn } from './acp-chat-preparation.js';
import { streamACPChatResponse } from './acp-chat-stream.js';
import {
  createACPConnectionClient,
  handleACPConnectionExtensionMethod,
  handleACPConnectionExtensionNotification,
  handleACPConnectionSessionUpdate,
  type ACPConnectionEventFields,
} from './acp-connection-events.js';
import {
  initializeACPConnectionProcess,
} from './acp-connection-lifecycle.js';
import {
  cleanupACPConnectionState,
  flushACPTextPart,
  getOrCreateACPAdapter,
  updateACPToolResultState,
} from './acp-connection-state.js';
import {
  type ACPConnectionStatusView,
  getACPConnectionCommandOptions,
  getACPConnectionSlashCommands,
  getACPConnectionStatus,
  getACPConnectionVirtualAgentViews,
} from './acp-connection-queries.js';
import {
  isACPConnectionConnected,
  isACPConnectionIdle,
  isACPConnectionStale,
  loadACPConnectionSession,
} from './acp-connection-session.js';
import {
  getACPCurrentModelName,
  hasACPConnectionAgent,
} from './acp-connection-view.js';
import type {
  ACPMode,
  ACPSlashCommand,
  ManagedTerminal,
} from './acp-bridge-types.js';

export type ACPConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | ACPStatusValue;

export class ACPConnection {
  private proc: ChildProcess | null = null;
  private connection: ClientSideConnection | null = null;
  private sessionId: string | null = null;
  private modes: ACPMode[] = [];
  private currentModeId: string | null = null;
  private slashCommands: ACPSlashCommand[] = [];
  private mcpServers: string[] = [];
  private configOptions: any[] = [];
  private promptCapabilities: {
    image?: boolean;
    audio?: boolean;
    embeddedContext?: boolean;
  } = {};
  private detectedModel: string | null = null;
  private terminals = new Map<string, ManagedTerminal>();
  private terminalCounter = 0;
  private status: ACPConnectionStatus = 'disconnected';
  private shuttingDown = false;
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: runtime state flag used in kill logic
  private intentionalKill = false;
  private lastActivityAt: number = Date.now();
  private activeWriter: ((chunk: any) => Promise<void>) | null = null;
  private responseAccumulator = '';
  private responseParts: Array<{ type: string; [key: string]: any }> = [];
  private sessionMap = new Map<string, string>();

  get prefix(): string {
    return this.config.id;
  }

  constructor(
    public readonly config: ACPConnectionConfig,
    private approvalRegistry: ApprovalRegistry,
    private logger: any,
    private cwd: string,
    _conversationId?: string,
    private memoryAdapters?: Map<string, FileMemoryAdapter>,
    private createMemoryAdapter?: (slug: string) => FileMemoryAdapter,
    private usageAggregatorRef?: { get: () => any },
    private eventBus?: {
      emit: (event: string, data?: Record<string, unknown>) => void;
    },
    private monitoringEvents?: import('node:events').EventEmitter,
    private persistEvent?: (event: any) => Promise<void>,
    private monitoringEmitter?: MonitoringEmitter,
  ) {
    if (this.config.cwd) this.cwd = this.config.cwd;
  }

  async start(): Promise<boolean> {
    if (this.shuttingDown) return false;
    if (!this.config.enabled) return false;
    if (this.proc) return false;
    this.status = 'connecting';
    this.intentionalKill = false;

    try {
      const initialized = await initializeACPConnectionProcess({
        config: this.config,
        cwd: this.cwd,
        prefix: this.prefix,
        logger: this.logger,
        createClient: () => this.createClient(),
      });
      if (!initialized) {
        this.logger.info(
          `[ACP:${this.prefix}] ${this.config.command} not found on PATH`,
        );
        this.status = ACPStatus.UNAVAILABLE;
        return false;
      }

      const {
        proc,
        connection,
        sessionId,
        modes,
        currentModeId,
        configOptions,
        promptCapabilities,
        detectedModel,
        protocolVersion,
        agentName,
      } = initialized;
      this.proc = proc;
      this.connection = connection;
      this.sessionId = sessionId;
      this.modes = modes;
      this.currentModeId = currentModeId;
      this.configOptions = configOptions;
      this.promptCapabilities = promptCapabilities;
      this.detectedModel = detectedModel;

      proc.on('exit', (code) => {
        this.logger.warn('[ACPBridge] kiro-cli exited', { code });
        this.proc = null;
        this.connection = null;
        this.sessionId = null;
        this.modes = [];
        this.slashCommands = [];
        this.status = 'disconnected';
        acpOps.add(1, { operation: 'disconnect' });
        this.eventBus?.emit('acp:status', {
          id: this.config.id,
          status: 'disconnected',
        });
      });

      this.logger.info('[ACPBridge] Connected', {
        protocolVersion,
        agent: agentName,
      });

      this.status = 'connected';
      acpOps.add(1, { operation: 'connect' });
      this.eventBus?.emit('acp:status', {
        id: this.config.id,
        status: 'connected',
      });
      this.eventBus?.emit('agents:changed');

      for (const mode of this.modes) {
        this.getOrCreateAdapter(`${this.prefix}-${mode.id}`);
      }

      this.logger.info('[ACPBridge] Session created', {
        sessionId: this.sessionId,
        modes: this.modes.map((mode) => mode.id),
        currentMode: this.currentModeId,
      });

      return true;
    } catch (error: any) {
      this.logger.error('[ACPBridge] Failed to start', {
        error: error.message,
      });
      acpOps.add(1, { operation: 'error' });
      this.status = 'error';
      this.eventBus?.emit('acp:status', {
        id: this.config.id,
        status: 'error',
      });
      this.cleanup();
      return false;
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.cleanup();
  }

  isConnected(): boolean {
    return isACPConnectionConnected({
      status: this.status,
      connection: this.connection,
      sessionId: this.sessionId,
    });
  }

  private touchActivity(): void {
    this.lastActivityAt = Date.now();
  }

  isIdle(): boolean {
    return isACPConnectionIdle({
      status: this.status,
      activeWriter: this.activeWriter,
      lastActivityAt: this.lastActivityAt,
    });
  }

  isStale(): boolean {
    return isACPConnectionStale({
      status: this.status,
      lastActivityAt: this.lastActivityAt,
    });
  }

  async cullSession(): Promise<void> {
    this.logger.info(`[ACP:${this.prefix}] Culling idle session`, {
      sessionId: this.sessionId,
      idleMs: Date.now() - this.lastActivityAt,
    });
    acpOps.add(1, { operation: 'cull' });
    this.cleanup();
    this.status = 'disconnected';
    this.eventBus?.emit('acp:status', { id: this.config.id, status: 'culled' });
  }

  getStatus(): ACPConnectionStatusView {
    return getACPConnectionStatus({
      status: this.status,
      modes: this.modes,
      sessionId: this.sessionId,
      mcpServers: this.mcpServers,
      configOptions: this.configOptions,
      detectedModel: this.detectedModel,
      interactive: this.config.interactive,
    });
  }

  hasAgent(slug: string): boolean {
    return hasACPConnectionAgent(this.modes, this.prefix, slug);
  }

  getVirtualAgents(): any[] {
    return getACPConnectionVirtualAgentViews({
      modes: this.modes,
      prefix: this.prefix,
      config: this.config,
      configOptions: this.configOptions,
      promptCapabilities: this.promptCapabilities,
      detectedModel: this.detectedModel,
    });
  }

  getSlashCommands(slug: string): ACPSlashCommand[] {
    return getACPConnectionSlashCommands({
      slug,
      prefix: this.prefix,
      modes: this.modes,
      slashCommands: this.slashCommands,
    });
  }

  async getCommandOptions(partialCommand: string): Promise<any[]> {
    return getACPConnectionCommandOptions({
      connection: this.connection,
      sessionId: this.sessionId,
      partialCommand,
      logger: this.logger,
    });
  }

  async handleChat(
    c: Context,
    slug: string,
    input: any,
    options: any,
    context?: { cwd?: string },
  ): Promise<Response> {
    this.touchActivity();

    if (this.status === 'disconnected' && !this.shuttingDown) {
      this.logger.info(`[ACP:${this.prefix}] Auto-restarting culled session`);
      const started = await this.start();
      if (!started) {
        return c.json({ success: false, error: 'ACP failed to restart' }, 503);
      }
    }

    if (!this.connection || !this.sessionId) {
      return c.json({ success: false, error: 'ACP not connected' }, 503);
    }

    const adapter = this.getOrCreateAdapter(slug);
    const resolvedAlias = getCachedUser().alias;
    const {
      configOptions,
      conversationId,
      currentModeId,
      inputText,
      isNewConversation,
      promptContent,
      userId,
    } = await prepareACPChatTurn({
      adapter,
      baseCwd: this.cwd,
      connection: this.connection,
      context,
      currentModeId: this.currentModeId,
      logger: this.logger,
      options,
      prefix: this.prefix,
      resolvedAlias,
      sessionId: this.sessionId,
      sessionMap: this.sessionMap,
      slug,
      input,
      configOptions: this.configOptions,
    });
    this.currentModeId = currentModeId;
    this.configOptions = configOptions;

    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');
    c.header('X-Accel-Buffering', 'no');

    return streamACPChatResponse(c, {
      adapter,
      connection: this.connection,
      conversationId,
      getActiveWriter: () => this.activeWriter,
      getCurrentModelName: () =>
        getACPCurrentModelName(this.configOptions, this.detectedModel),
      getResponseAccumulator: () => this.responseAccumulator,
      getResponseParts: () => this.responseParts,
      input,
      inputText,
      isNewConversation,
      logger: this.logger,
      monitoringEmitter: this.monitoringEmitter,
      monitoringEvents: this.monitoringEvents,
      options,
      persistEvent: this.persistEvent,
      promptContent,
      sessionId: this.sessionId,
      setActiveWriter: (writer) => {
        this.activeWriter = writer;
      },
      setResponseAccumulator: (value) => {
        this.responseAccumulator = value;
      },
      setResponseParts: (parts) => {
        this.responseParts = parts;
      },
      slug,
      updateToolResult: (toolCallId, result, isError) =>
        this.updateToolResult(toolCallId, result, isError),
      usageAggregatorRef: this.usageAggregatorRef,
      userId,
    });
  }

  async loadSession(sessionId: string): Promise<boolean> {
    const loaded = await loadACPConnectionSession({
      connection: this.connection,
      sessionId,
      cwd: this.cwd,
      logger: this.logger,
    });
    if (loaded) {
      this.sessionId = sessionId;
    }
    return loaded;
  }

  private createClient(): Client {
    return createACPConnectionClient({
      cwd: this.cwd,
      terminals: this.terminals,
      approvalRegistry: this.approvalRegistry,
      getActiveWriter: () => this.activeWriter,
      nextTerminalId: () => `term-${++this.terminalCounter}`,
      handleSessionUpdate: async (params: SessionNotification) =>
        this.handleSessionUpdate(params),
      handleExtNotification: (method, params) =>
        this.handleExtNotification(method, params),
      handleExtMethod: (method, params) => this.handleExtMethod(method, params),
    });
  }

  private flushTextPart(): void {
    const next = flushACPTextPart(
      this.responseAccumulator,
      this.responseParts,
    );
    this.responseAccumulator = next.responseAccumulator;
    this.responseParts = next.responseParts;
  }

  private updateToolResult(
    toolCallId: string,
    result: string | undefined,
    isError = false,
  ): void {
    this.responseParts = updateACPToolResultState(
      this.responseParts,
      toolCallId,
      result,
      isError,
    );
  }

  private async handleSessionUpdate(
    params: SessionNotification,
  ): Promise<void> {
    this.touchActivity();
    await handleACPConnectionSessionUpdate(params, {
      logger: this.logger,
      fields: this.getEventFields(),
      applyFields: (fields) => this.applyEventFields(fields),
      flushTextPart: () => this.flushTextPart(),
      updateToolResult: (toolCallId, result, isError) =>
        this.updateToolResult(toolCallId, result, isError),
    });
  }

  private handleExtNotification(
    method: string,
    params: Record<string, unknown>,
  ): void {
    handleACPConnectionExtensionNotification(method, params, {
      logger: this.logger,
      fields: this.getEventFields(),
      applyFields: (fields) => this.applyEventFields(fields),
    });
  }

  private handleExtMethod(
    method: string,
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    return handleACPConnectionExtensionMethod(method, params, {
      logger: this.logger,
      fields: this.getEventFields(),
      applyFields: (fields) => this.applyEventFields(fields),
    });
  }

  private getEventFields(): ACPConnectionEventFields {
    return {
      activeWriter: this.activeWriter,
      responseAccumulator: this.responseAccumulator,
      responseParts: this.responseParts,
      currentModeId: this.currentModeId,
      configOptions: this.configOptions,
      slashCommands: this.slashCommands,
      mcpServers: this.mcpServers,
    };
  }

  private applyEventFields(fields: ACPConnectionEventFields): void {
    this.activeWriter = fields.activeWriter;
    this.responseAccumulator = fields.responseAccumulator;
    this.responseParts = fields.responseParts;
    this.currentModeId = fields.currentModeId;
    this.configOptions = fields.configOptions;
    this.slashCommands = fields.slashCommands;
    this.mcpServers = fields.mcpServers;
  }

  private getOrCreateAdapter(slug: string): FileMemoryAdapter | null {
    return getOrCreateACPAdapter({
      slug,
      memoryAdapters: this.memoryAdapters,
      createMemoryAdapter: this.createMemoryAdapter,
    });
  }

  private cleanup(): void {
    const next = cleanupACPConnectionState({
      approvalRegistry: this.approvalRegistry,
      logger: this.logger,
      prefix: this.prefix,
      terminals: this.terminals,
      proc: this.proc,
    });
    this.intentionalKill = true;
    this.proc = next.proc;
    this.connection = next.connection;
    this.sessionId = next.sessionId;
    this.modes = next.modes;
    this.slashCommands = next.slashCommands;
    this.mcpServers = next.mcpServers;
    this.configOptions = next.configOptions;
    this.currentModeId = next.currentModeId;
  }
}
