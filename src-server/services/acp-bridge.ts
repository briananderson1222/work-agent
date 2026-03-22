/**
 * ACP Bridge — connects to kiro-cli via Agent Client Protocol.
 * Spawns kiro-cli acp as a subprocess, translates ACP events to the
 * existing SSE streaming format so the UI works unchanged.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { getCachedUser } from '../routes/auth.js';
import { MonitoringEmitter } from '../monitoring/emitter.js';
import { readFile, writeFile } from 'node:fs/promises';
import { Readable, Writable } from 'node:stream';
import {
  type Client,
  ClientSideConnection,
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  type KillTerminalCommandRequest,
  ndJsonStream,
  PROTOCOL_VERSION,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type ReleaseTerminalRequest,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type TerminalOutputRequest,
  type TerminalOutputResponse,
  type WaitForTerminalExitRequest,
  type WaitForTerminalExitResponse,
  type WriteTextFileRequest,
} from '@agentclientprotocol/sdk';
import type { Context } from 'hono';
import { stream as honoStream } from 'hono/streaming';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type { ACPConnectionConfig } from '../domain/types.js';
import { ACPStatus, type ACPStatusValue } from '../domain/types.js';
import { acpOps, approvalOps } from '../telemetry/metrics.js';
import { ApprovalRegistry } from './approval-registry.js';
import { ACPProbe } from './acp-probe.js';

interface ACPMode {
  id: string;
  name: string;
  description?: string;
}

interface ACPSlashCommand {
  name: string;
  description: string;
  hint?: string;
}

interface ManagedTerminal {
  process: ChildProcess;
  output: string;
  exitCode: number | null;
}

// ACP SDK response types that are missing proper interfaces
interface InitializeResult {
  protocolVersion: number;
  agentInfo?: {
    name: string;
    version?: string;
  };
  agentCapabilities?: {
    loadSession?: boolean;
    promptCapabilities?: {
      image?: boolean;
      audio?: boolean;
      embeddedContext?: boolean;
    };
  };
}

interface SessionResult {
  sessionId: string;
  modes?: {
    availableModes: ACPMode[];
    currentModeId?: string;
  };
  configOptions?: ConfigOption[];
}

interface ConfigOption {
  category: string;
  currentValue?: string;
  options?: Array<{
    name: string;
    value: string;
  }>;
}

interface SessionUpdate {
  sessionUpdate: string;
  content?:
    | {
        type: string;
        text?: string;
        url?: string;
        data?: string;
        resource?: {
          text?: string;
          uri?: string;
        };
      }
    | Array<{
        type: string;
        content?: {
          type: string;
          text?: string;
        };
        path?: string;
        oldText?: string | null;
        newText?: string;
      }>;
  toolCallId?: string;
  title?: string;
  rawInput?: any;
  status?: string;
  entries?: Array<{
    status: string;
    content: string;
  }>;
  modeId?: string;
  configOptions?: ConfigOption[];
}

interface MessagePart {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: any;
  state?: string;
  result?: string;
  isError?: boolean;
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: MessagePart[];
  metadata?: {
    timestamp?: number;
    model?: string | null;
  };
}

interface ExtNotificationParams {
  commands?: Array<{
    name: string;
    description?: string;
    input?: {
      hint?: string;
    };
  }>;
  serverName?: string;
  url?: string;
}

interface ToolCall {
  title?: string | null;
  rawInput?: any;
}

interface ExtendedRequestPermissionRequest
  extends Omit<RequestPermissionRequest, 'toolCall'> {
  toolCall?: ToolCall;
}

interface EnvironmentVariable {
  name: string;
  value: string;
}

interface ExtendedCreateTerminalRequest extends CreateTerminalRequest {
  env?: EnvironmentVariable[];
}

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

  // Per-prompt SSE writer — set during handleChat, used by Client callbacks
  private activeWriter: ((chunk: any) => Promise<void>) | null = null;
  // Accumulated response text during a prompt turn
  private responseAccumulator = '';
  private responseParts: Array<{ type: string; [key: string]: any }> = [];

  // conversationId → acpSessionId mapping for resumption
  private sessionMap = new Map<string, string>();

  get prefix(): string {
    return this.config.id;
  }

  constructor(
    public readonly config: ACPConnectionConfig,
    private approvalRegistry: ApprovalRegistry,
    private logger: any,
    private cwd: string,
    private conversationId?: string,
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

  // ── Lifecycle ──────────────────────────────────────────────────

  async start(): Promise<boolean> {
    if (this.shuttingDown) return false;
    if (!this.config.enabled) return false;
    if (this.proc) return false; // Already running
    this.status = 'connecting';
    this.intentionalKill = false;

    const bin = await this.findCommand();
    if (!bin) {
      this.logger.info(
        `[ACP:${this.prefix}] ${this.config.command} not found on PATH`,
      );
      this.status = ACPStatus.UNAVAILABLE;
      return false;
    }

    try {
      this.proc = spawn(bin, this.config.args || [], {
        stdio: ['pipe', 'pipe', 'inherit'],
        cwd: this.cwd,
        windowsHide: true,
      });

      this.proc.on('exit', (code) => {
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

      const input = Writable.toWeb(this.proc.stdin!);
      const output = Readable.toWeb(
        this.proc.stdout!,
      ) as ReadableStream<Uint8Array>;
      const acpStream = ndJsonStream(input, output);

      this.connection = new ClientSideConnection(
        (_agent) => this.createClient(),
        acpStream,
      );

      // Initialize
      const initResult = (await this.connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
        },
        clientInfo: { name: 'stallion', version: '1.0.0' },
      })) as InitializeResult;

      this.logger.info('[ACPBridge] Connected', {
        protocolVersion: initResult.protocolVersion,
        agent: initResult.agentInfo?.name,
      });

      // Capture prompt capabilities from agent
      this.promptCapabilities =
        initResult.agentCapabilities?.promptCapabilities || {};

      // Create a fresh session (sessions are ephemeral, no resume)
      const sessionResult = (await this.connection.newSession({
        cwd: this.cwd,
        mcpServers: [],
      })) as SessionResult;

      this.sessionId = sessionResult.sessionId;

      // Extract modes
      if (sessionResult.modes?.availableModes) {
        this.modes = sessionResult.modes.availableModes;
        this.currentModeId =
          sessionResult.modes.currentModeId || this.modes[0]?.id || null;
      }

      // Extract config options (includes model selector)
      if (sessionResult.configOptions) {
        this.configOptions = sessionResult.configOptions;
      }

      this.status = 'connected';
      acpOps.add(1, { operation: 'connect' });
      this.eventBus?.emit('acp:status', {
        id: this.config.id,
        status: 'connected',
      });
      this.eventBus?.emit('agents:changed');

      // Detect model from CLI settings if not provided via configOptions
      if (this.configOptions.length === 0) {
        await this.detectModelFromCli();
      }

      // Ensure adapters exist for all discovered modes
      for (const mode of this.modes) {
        this.getOrCreateAdapter(`${this.prefix}-${mode.id}`);
      }

      this.logger.info('[ACPBridge] Session created', {
        sessionId: this.sessionId,
        modes: this.modes.map((m) => m.id),
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
    return (
      this.status === 'connected' &&
      this.connection !== null &&
      this.sessionId !== null
    );
  }

  private touchActivity(): void {
    this.lastActivityAt = Date.now();
  }

  isIdle(): boolean {
    if (this.status !== 'connected') return false;
    if (this.activeWriter) return false;
    const elapsed = Date.now() - this.lastActivityAt;
    return elapsed > 5 * 60_000;
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

  getStatus(): {
    status: ACPConnectionStatus;
    modes: string[];
    sessionId: string | null;
    mcpServers: string[];
    configOptions: any[];
    currentModel: string | null;
    interactive?: { args: string[] };
  } {
    return {
      status: this.status,
      modes: this.modes.map((m) => m.id),
      sessionId: this.sessionId,
      mcpServers: this.mcpServers,
      configOptions: this.configOptions,
      currentModel: this.getCurrentModelName(),
      interactive: this.config.interactive,
    };
  }

  // ── Agent Discovery ────────────────────────────────────────────

  hasAgent(slug: string): boolean {
    return this.modes.some((m) => `${this.prefix}-${m.id}` === slug);
  }

  getVirtualAgents(): any[] {
    // Build model options from configOptions with category=model
    const modelConfig = this.configOptions.find(
      (o: any) => o.category === 'model',
    );
    const modelOptions =
      modelConfig?.options?.map((o: any) => ({
        id: o.value,
        name: o.name || o.value,
        originalId: o.value,
      })) || null;

    return this.modes.map((mode) => ({
      slug: `${this.prefix}-${mode.id}`,
      name: `${mode.name}`,
      description: mode.description || `${this.config.name} ${mode.id} mode`,
      model: this.getCurrentModelName() || this.config.name,
      icon: this.config.icon || '🔌',
      source: 'acp' as const,
      connectionName: this.config.name,
      planUrl: (this.config as any).planUrl,
      planLabel: (this.config as any).planLabel,
      updatedAt: new Date().toISOString(),
      supportsAttachments: this.promptCapabilities.image || false,
      modelOptions,
    }));
  }

  /** Get slash commands advertised by kiro-cli for a given agent slug */
  getSlashCommands(slug: string): ACPSlashCommand[] {
    if (!this.hasAgent(slug)) return [];
    return this.slashCommands;
  }

  /** Get autocomplete suggestions for a partial command via _kiro.dev/commands/options */
  async getCommandOptions(partialCommand: string): Promise<any[]> {
    if (!this.connection || !this.sessionId) return [];
    try {
      const result = await Promise.race([
        this.connection.extMethod('_kiro.dev/commands/options', {
          sessionId: this.sessionId,
          partialCommand,
        }),
        new Promise<any>((_, rej) =>
          setTimeout(() => rej(new Error('timeout')), 3000),
        ),
      ]);
      return (result as any)?.options || [];
    } catch (e) {
      this.logger.debug('Failed to get command options', { error: e });
      return [];
    }
  }

  // ── Chat Handling ──────────────────────────────────────────────

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

    // Switch mode if needed
    const modeId = slug.replace(`${this.prefix}-`, '');
    if (modeId !== this.currentModeId) {
      await this.connection.setSessionMode({
        sessionId: this.sessionId,
        modeId,
      });
      this.currentModeId = modeId;
    }

    // Switch model if requested via configOption
    if (options.model) {
      const modelConfig = this.configOptions.find(
        (o: any) => o.category === 'model',
      );
      if (modelConfig && modelConfig.currentValue !== options.model) {
        try {
          const result = await this.connection.setSessionConfigOption({
            sessionId: this.sessionId,
            configId: modelConfig.id,
            value: options.model,
          });
          this.configOptions =
            (result as any).configOptions || this.configOptions;
        } catch (e: any) {
          this.logger.warn('[ACPBridge] Failed to set model', {
            model: options.model,
            error: e.message,
          });
        }
      }
    }

    // Resolve userId and conversationId (same format as VoltAgent)
    const resolvedAlias = getCachedUser().alias;
    const userId = options.userId || `agent:${slug}:user:${resolvedAlias}`;
    const isNewConversation = !options.conversationId;
    const conversationId =
      options.conversationId ||
      `${userId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;

    // Parse input: string or UIMessage array (with text + file parts)
    let inputText: string;
    const promptContent: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; data: string; mimeType: string }
    > = [];

    if (Array.isArray(input) && input[0]?.parts) {
      // UIMessage format: [{ id, role, parts: [{ type: 'text', text }, { type: 'file', url, mediaType }] }]
      const parts = input[0].parts as Array<{
        type: string;
        text?: string;
        url?: string;
        mediaType?: string;
      }>;
      inputText = parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text || '')
        .join('\n');
      for (const p of parts) {
        if (p.type === 'file' && p.url) {
          // Strip data URL prefix: "data:image/png;base64,ABC..." → "ABC..."
          const base64 = p.url.replace(/^data:[^;]+;base64,/, '');
          promptContent.push({
            type: 'image' as const,
            data: base64,
            mimeType: p.mediaType || 'image/png',
          });
        } else if (p.type === 'text' && p.text) {
          promptContent.push({ type: 'text' as const, text: p.text });
        }
      }
    } else {
      inputText = typeof input === 'string' ? input : JSON.stringify(input);
      promptContent.push({ type: 'text' as const, text: inputText });
    }

    // Prepend project working directory context if provided
    if (context?.cwd && context.cwd !== this.cwd) {
      promptContent.unshift({
        type: 'text' as const,
        text: `[Working directory: ${context.cwd}]`,
      });
    }

    // Get or create memory adapter for this ACP agent
    const adapter = this.getOrCreateAdapter(slug);

    // Create conversation if new
    if (adapter && isNewConversation) {
      const title =
        options.title ||
        (inputText.length > 50
          ? `${inputText.substring(0, 50)}...`
          : inputText);
      await adapter.createConversation({
        id: conversationId,
        resourceId: slug,
        userId,
        title,
        metadata: { acpSessionId: this.sessionId },
      });
      // Store mapping for resumption
      this.sessionMap.set(conversationId, this.sessionId!);
    }

    // Save user message
    if (adapter) {
      const userMessage: ConversationMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: inputText }],
      };
      await adapter.addMessage(
        userMessage as unknown as any,
        userId,
        conversationId,
      );
    }

    // Set SSE headers
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');
    c.header('X-Accel-Buffering', 'no');

    return honoStream(c, async (streamWriter) => {
      const write = async (chunk: any) => {
        await streamWriter.write(`data: ${JSON.stringify(chunk)}\n\n`);
      };

      // Set active writer so Client callbacks can emit SSE events
      this.activeWriter = write;
      this.responseAccumulator = '';
      this.responseParts = [];

      // Waiting detection — emit if no output for 60s
      let lastOutputAt = Date.now();
      let waitingEmitted = false;
      const STALE_THRESHOLD_MS = 60_000;
      const POLL_INTERVAL_MS = 5_000;

      const trackedWrite = async (chunk: any) => {
        if (
          chunk.type === 'text-delta' ||
          chunk.type === 'tool-call' ||
          chunk.type === 'tool-result' ||
          chunk.type === 'reasoning-delta'
        ) {
          lastOutputAt = Date.now();
          if (waitingEmitted) {
            waitingEmitted = false;
            await write({ type: 'waiting-cleared' });
          }
        }
        return write(chunk);
      };
      this.activeWriter = trackedWrite;

      const waitingTimer = setInterval(async () => {
        if (!this.activeWriter) return;
        const elapsed = Date.now() - lastOutputAt;
        if (elapsed >= STALE_THRESHOLD_MS) {
          waitingEmitted = true;
          acpOps.add(1, { operation: 'waiting-detected' });
          try {
            await write({ type: 'waiting', elapsedMs: elapsed });
          } catch (e) {
            this.logger.debug('Failed to write waiting event to stream', { error: e });
            /* stream may be closed */
          }
        }
      }, POLL_INTERVAL_MS);

      // Wire up cancel
      let cancelled = false;
      const abortHandler = () => {
        cancelled = true;
        if (this.connection && this.sessionId) {
          this.connection
            .cancel({ sessionId: this.sessionId })
            .catch((e) => this.logger.error('[acp] cancel failed:', e));
        }
      };
      c.req.raw.signal?.addEventListener('abort', abortHandler);

      // Monitoring: emit agent-start
      const chatStartMs = Date.now();
      const traceId = `acp:${slug}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      const agentStartEvent = {
        type: 'agent-start',
        timestamp: new Date().toISOString(),
        timestampMs: chatStartMs,
        agentSlug: slug,
        conversationId,
        userId,
        traceId,
        input: inputText.length > 200 ? `${inputText.substring(0, 200)}...` : inputText,
      };
      this.monitoringEvents?.emit('event', agentStartEvent);
      this.persistEvent?.(agentStartEvent).catch(() => {});
      this.monitoringEmitter?.emitAgentStart({
        slug,
        conversationId, userId, traceId,
        input: typeof input === 'string' ? input : '[complex input]',
        provider: 'acp',
      });

      try {
        // Emit conversation-started for new conversations
        if (isNewConversation) {
          await write({
            type: 'conversation-started',
            conversationId,
            title: options.title || inputText.substring(0, 50),
          });
        }

        // Slash commands: use kiro extension (response comes via session notifications → activeWriter)
        if (inputText.startsWith('/')) {
          const spaceIdx = inputText.indexOf(' ');
          const cmdName = (
            spaceIdx > 0 ? inputText.substring(0, spaceIdx) : inputText
          ).replace(/^\//, '');
          const cmdInput =
            spaceIdx > 0 ? inputText.substring(spaceIdx + 1) : undefined;
          try {
            // Adjacently tagged Rust enum — try PascalCase variant name
            const pascalCmd =
              cmdName.charAt(0).toUpperCase() + cmdName.slice(1);
            const commandPayload = cmdInput
              ? { command: pascalCmd, input: cmdInput }
              : { command: pascalCmd };
            // Fire the command — don't await the RPC response
            this.connection!.extMethod('_kiro.dev/commands/execute', {
              sessionId: this.sessionId!,
              ...commandPayload,
            }).catch((e) =>
              this.logger.warn('[ACPBridge] extMethod error', {
                error: String(e),
              }),
            );
            // Brief wait for any immediate notifications
            await new Promise((r) => setTimeout(r, 500));
            // If no response came through notifications, send an acknowledgment
            if (this.responseAccumulator.length === 0) {
              const ack = `/${cmdName}${cmdInput ? ` ${cmdInput}` : ''} ✓`;
              await write({ type: 'text-delta', text: ack });
              this.responseAccumulator = ack;
            }
          } catch (e: any) {
            this.logger.warn(
              '[ACPBridge] Command extension failed, falling back to prompt',
              { error: e.message },
            );
            await this.connection!.prompt({
              sessionId: this.sessionId!,
              prompt: promptContent,
            });
          }
        } else {
          // Regular prompt
          await this.connection!.prompt({
            sessionId: this.sessionId!,
            prompt: promptContent,
          });
        }

        // Save assistant message
        if (
          adapter &&
          (this.responseAccumulator || this.responseParts.length > 0)
        ) {
          const parts = this.buildAssistantParts();
          const assistantMsg: ConversationMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            parts,
            metadata: {
              timestamp: Date.now(),
              model: this.getCurrentModelName(),
            },
          };
          await adapter.addMessage(
            assistantMsg as unknown as any,
            userId,
            conversationId,
          );
          // Update analytics (no token data from ACP, but counts messages)
          if (this.usageAggregatorRef?.get()) {
            await this.usageAggregatorRef
              .get()
              .incrementalUpdate(assistantMsg, slug, conversationId)
              .catch((e: unknown) =>
                this.logger.error('[acp] usage update failed:', e),
              );
          }
        }

        const reason = cancelled ? 'cancelled' : 'end_turn';
        await write({ type: 'finish', finishReason: reason });
        await streamWriter.write('data: [DONE]\n\n');
      } catch (error: any) {
        // Mark in-progress tool calls as failed
        for (const part of this.responseParts) {
          if (part.type === 'tool-invocation' && part.state === 'call') {
            part.state = 'error';
            part.result = 'Tool call interrupted — agent session ended unexpectedly';
            if (this.activeWriter) {
              await this.activeWriter({
                type: 'tool-result',
                toolCallId: part.toolCallId,
                error: 'Tool call interrupted — agent session ended unexpectedly',
              });
            }
          }
        }
        const failedCount = this.responseParts.filter(p => p.type === 'tool-invocation' && p.state === 'error').length;
        if (failedCount > 0) {
          acpOps.add(failedCount, { operation: 'tool-interrupted' });
        }

        // Save partial response if we have one
        if (
          adapter &&
          (this.responseAccumulator || this.responseParts.length > 0)
        ) {
          if (cancelled) {
            this.responseAccumulator +=
              '\n\n---\n\n_⚠️ Response cancelled by user_';
          }
          const parts = this.buildAssistantParts();
          const partialMessage: ConversationMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            parts,
          };
          await adapter
            .addMessage(
              partialMessage as unknown as any,
              userId,
              conversationId,
            )
            .catch((e) => this.logger.error('[acp] operation failed:', e));
        }

        if (cancelled) {
          await write({ type: 'finish', finishReason: 'cancelled' });
        } else {
          this.logger.error('[ACPBridge] Prompt error', {
            error: error.message,
          });
          await write({ type: 'error', errorText: error.message });
        }
        await streamWriter.write('data: [DONE]\n\n');
      } finally {
        clearInterval(waitingTimer);
        c.req.raw.signal?.removeEventListener('abort', abortHandler);

        // Monitoring: emit agent-complete
        const agentCompleteEvent = {
          type: 'agent-complete',
          timestamp: new Date().toISOString(),
          timestampMs: Date.now(),
          agentSlug: slug,
          conversationId,
          userId,
          traceId,
          reason: cancelled ? 'cancelled' : 'end_turn',
          inputChars: inputText.length,
          outputChars: this.responseAccumulator.length,
          toolCallCount: this.responseParts.filter(p => p.type === 'tool-invocation').length,
        };
        this.monitoringEvents?.emit('event', agentCompleteEvent);
        this.persistEvent?.(agentCompleteEvent).catch(() => {});
        this.monitoringEmitter?.emitAgentComplete({
          slug,
          conversationId, userId, traceId,
          reason: cancelled ? 'cancelled' : 'complete',
        });

        this.activeWriter = null;
        this.responseAccumulator = '';
        this.responseParts = [];
      }
    });
  }

  // ── Session Persistence ────────────────────────────────────────

  /** Load an existing ACP session (e.g., after reconnect) */
  async loadSession(sessionId: string): Promise<boolean> {
    if (!this.connection) return false;
    try {
      await this.connection.loadSession({
        sessionId,
        cwd: this.cwd,
        mcpServers: [],
      });
      this.sessionId = sessionId;
      this.logger.info('[ACPBridge] Session loaded', { sessionId });
      return true;
    } catch (error: any) {
      this.logger.warn('[ACPBridge] Failed to load session', {
        sessionId,
        error: error.message,
      });
      return false;
    }
  }

  // ── ACP Client Implementation ──────────────────────────────────

  private createClient(): Client {
    return {
      sessionUpdate: async (params: SessionNotification) => {
        await this.handleSessionUpdate(params);
      },

      requestPermission: async (
        params: RequestPermissionRequest,
      ): Promise<RequestPermissionResponse> => {
        return this.handlePermissionRequest(
          params as ExtendedRequestPermissionRequest,
        );
      },

      readTextFile: async (
        params: ReadTextFileRequest,
      ): Promise<ReadTextFileResponse> => {
        const content = await readFile(params.path, 'utf-8');
        return { content };
      },

      writeTextFile: async (params: WriteTextFileRequest) => {
        await writeFile(params.path, params.content);
        return {};
      },

      createTerminal: async (
        params: CreateTerminalRequest,
      ): Promise<CreateTerminalResponse> => {
        return this.handleCreateTerminal(
          params as ExtendedCreateTerminalRequest,
        );
      },

      terminalOutput: async (
        params: TerminalOutputRequest,
      ): Promise<TerminalOutputResponse> => {
        const term = this.terminals.get(params.terminalId);
        if (!term) return { output: '', truncated: false };
        return {
          output: term.output,
          truncated: false,
          exitStatus:
            term.exitCode !== null ? { exitCode: term.exitCode } : null,
        };
      },

      releaseTerminal: async (params: ReleaseTerminalRequest) => {
        const term = this.terminals.get(params.terminalId);
        if (term) {
          term.process.kill();
          this.terminals.delete(params.terminalId);
        }
      },

      waitForTerminalExit: async (
        params: WaitForTerminalExitRequest,
      ): Promise<WaitForTerminalExitResponse> => {
        const term = this.terminals.get(params.terminalId);
        if (!term) return { exitCode: -1 };
        if (term.exitCode !== null) return { exitCode: term.exitCode };
        return new Promise((resolve) => {
          term.process.on('exit', (code) => resolve({ exitCode: code ?? -1 }));
        });
      },

      killTerminal: async (params: KillTerminalCommandRequest) => {
        const term = this.terminals.get(params.terminalId);
        if (term) term.process.kill();
      },

      // Kiro extensions — slash commands, MCP events, metadata
      extNotification: async (
        method: string,
        params: Record<string, unknown>,
      ) => {
        this.handleExtNotification(method, params);
      },

      extMethod: async (method: string, params: Record<string, unknown>) => {
        return this.handleExtMethod(method, params);
      },
    };
  }

  // ── Event Translation ──────────────────────────────────────────

  /** Flush accumulated text into a text part */
  private flushTextPart(): void {
    if (this.responseAccumulator) {
      this.responseParts.push({ type: 'text', text: this.responseAccumulator });
      this.responseAccumulator = '';
    }
  }

  /** Update a tool-invocation part with its result */
  private updateToolResult(
    toolCallId: string,
    result: string | undefined,
    isError = false,
  ): void {
    const part = this.responseParts.find(
      (p) => p.type === 'tool-invocation' && p.toolCallId === toolCallId,
    );
    if (part) {
      part.state = isError ? 'error' : 'result';
      part.result = result;
    } else {
      // Tool result without a matching call — store as standalone
      this.responseParts.push({
        type: 'tool-result',
        toolCallId,
        result,
        isError,
      });
    }
  }

  /** Build the parts array for the assistant message */
  private buildAssistantParts(): Array<{ type: string; [key: string]: any }> {
    this.flushTextPart();
    return this.responseParts.length > 0
      ? this.responseParts
      : [{ type: 'text', text: '' }];
  }

  private async handleSessionUpdate(
    params: SessionNotification,
  ): Promise<void> {
    this.lastActivityAt = Date.now();
    const update = params.update as SessionUpdate;

    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        if (!this.activeWriter) break;
        if (!Array.isArray(update.content) && update.content?.type === 'text') {
          this.responseAccumulator += update.content.text || '';
          await this.activeWriter({
            type: 'text-delta',
            text: update.content.text || '',
          });
        } else if (
          !Array.isArray(update.content) &&
          update.content?.type === 'image'
        ) {
          // Emit image as a text placeholder with the URL
          await this.activeWriter({
            type: 'text-delta',
            text: `\n![image](${update.content.url || update.content.data || ''})\n`,
          });
        } else if (
          !Array.isArray(update.content) &&
          update.content?.type === 'resource'
        ) {
          // Emit resource content as text
          const text =
            update.content.resource?.text ||
            update.content.resource?.uri ||
            '[resource]';
          await this.activeWriter({
            type: 'text-delta',
            text: `\n\`\`\`\n${text}\n\`\`\`\n`,
          });
        }
        break;

      case 'agent_thought_chunk':
        if (!this.activeWriter) break;
        if (!Array.isArray(update.content) && update.content?.type === 'text') {
          await this.activeWriter({
            type: 'reasoning-delta',
            id: '0',
            text: update.content.text || '',
          });
        }
        break;

      case 'tool_call':
        if (!this.activeWriter) break;
        this.flushTextPart();
        this.responseParts.push({
          type: 'tool-invocation',
          toolCallId: update.toolCallId,
          toolName: update.title || 'unknown',
          args: update.rawInput,
          state: 'call',
        });
        await this.activeWriter({
          type: 'tool-call',
          toolCallId: update.toolCallId,
          toolName: update.title || 'unknown',
          input: update.rawInput,
          server: '',
          tool: update.title,
        });
        break;

      case 'tool_call_update': {
        if (!this.activeWriter) break;
        // Handle diff content from tool calls
        if (Array.isArray(update.content)) {
          const diffContent = update.content.find((c) => c.type === 'diff');
          if (diffContent) {
            const output = formatDiff(
              diffContent.path || '',
              diffContent.oldText ?? null,
              diffContent.newText || '',
            );
            this.updateToolResult(update.toolCallId || '', output);
            await this.activeWriter({
              type: 'tool-result',
              toolCallId: update.toolCallId,
              output,
              result: output,
            });
            break;
          }
        }

        if (update.status === 'completed' || update.status === 'failed') {
          let textContent = '';
          if (Array.isArray(update.content)) {
            textContent = update.content
              .filter((c) => c.type === 'content' && c.content?.type === 'text')
              .map((c) => c.content?.text || '')
              .join('\n');
          }
          this.updateToolResult(
            update.toolCallId || '',
            textContent,
            update.status === 'failed',
          );
          await this.activeWriter({
            type: 'tool-result',
            toolCallId: update.toolCallId,
            ...(update.status === 'failed'
              ? { error: textContent || 'Tool call failed' }
              : { output: textContent, result: textContent }),
          });
        }
        break;
      }

      case 'plan':
        if (!this.activeWriter) break;
        if (update.entries?.length) {
          await this.activeWriter({ type: 'reasoning-start', id: '0' });
          const planText = update.entries
            .map((e: any) => {
              const icon =
                e.status === 'completed'
                  ? '✅'
                  : e.status === 'in_progress'
                    ? '🔄'
                    : '⬜';
              return `${icon} ${e.content}`;
            })
            .join('\n');
          await this.activeWriter({
            type: 'reasoning-delta',
            id: '0',
            text: planText,
          });
          await this.activeWriter({ type: 'reasoning-end', id: '0' });
        }
        break;

      case 'current_mode_update':
        this.currentModeId = update.modeId || null;
        break;

      case 'config_options_update':
        this.configOptions = update.configOptions || [];
        break;

      case 'available_commands_update':
        // Standard ACP command advertisement
        this.slashCommands = ((update as any).availableCommands || []).map(
          (c: any) => ({
            name: c.name.startsWith('/') ? c.name : `/${c.name}`,
            description: c.description || '',
            hint: c.input?.hint,
          }),
        );
        this.logger.info('[ACPBridge] Commands updated (standard ACP)', {
          count: this.slashCommands.length,
        });
        break;

      default:
        // Kiro extension status notifications (compaction, clear, etc.) may arrive as session updates
        if (
          this.activeWriter &&
          update.sessionUpdate?.startsWith('_kiro.dev/')
        ) {
          const msg =
            (update as any).message ||
            (update as any).status ||
            (update as any).text;
          if (msg && typeof msg === 'string') {
            this.responseAccumulator += `${msg}\n`;
            await this.activeWriter({ type: 'text-delta', text: `${msg}\n` });
          }
          this.logger.info('[ACPBridge] Kiro extension session update', {
            type: update.sessionUpdate,
            update,
          });
        } else {
          this.logger.debug('[ACPBridge] Unhandled session update', {
            type: update.sessionUpdate,
          });
        }
        break;
    }
  }

  private async handlePermissionRequest(
    params: ExtendedRequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    const approvalId = ApprovalRegistry.generateId('acp');
    const toolTitle = params.toolCall?.title || 'Unknown tool';

    // Inject approval request into SSE stream
    if (this.activeWriter) {
      await this.activeWriter({
        type: 'tool-approval-request',
        approvalId,
        toolName: toolTitle,
        server: '',
        tool: toolTitle,
        toolArgs: params.toolCall?.rawInput,
      });
    }

    // Block until user responds via POST /tool-approval/:approvalId
    const approved = await this.approvalRegistry.register(approvalId);

    // Map back to ACP response
    const allowOption = params.options.find((o) => o.kind === 'allow_once');
    const rejectOption = params.options.find((o) => o.kind === 'reject_once');
    const selectedId = approved
      ? allowOption?.optionId || params.options[0]?.optionId || 'allow'
      : rejectOption?.optionId ||
        params.options[params.options.length - 1]?.optionId ||
        'reject';

    return { outcome: { outcome: 'selected', optionId: selectedId } };
  }

  private async handleCreateTerminal(
    params: ExtendedCreateTerminalRequest,
  ): Promise<CreateTerminalResponse> {
    const id = `term-${++this.terminalCounter}`;
    const proc = spawn(params.command, params.args || [], {
      cwd: params.cwd || this.cwd,
      env: {
        ...process.env,
        ...(params.env
          ? Object.fromEntries(params.env.map((e) => [e.name, e.value]))
          : {}),
      },
      windowsHide: true,
    });

    const term: ManagedTerminal = { process: proc, output: '', exitCode: null };
    proc.stdout?.on('data', (d: Buffer) => {
      term.output += d.toString();
    });
    proc.stderr?.on('data', (d: Buffer) => {
      term.output += d.toString();
    });
    proc.on('exit', (code) => {
      term.exitCode = code;
    });

    this.terminals.set(id, term);
    return { terminalId: id };
  }

  // ── Kiro Extensions ─────────────────────────────────────────────

  private handleExtNotification(
    method: string,
    params: Record<string, unknown>,
  ): void {
    switch (method) {
      case '_kiro.dev/commands/available': {
        const notificationParams = params as ExtNotificationParams;
        const cmds = notificationParams.commands || [];
        this.slashCommands = cmds.map((c) => ({
          name: c.name,
          description: c.description || '',
          hint: c.input?.hint,
        }));
        this.logger.info('[ACPBridge] Slash commands received', {
          count: this.slashCommands.length,
        });
        break;
      }
      case '_kiro.dev/mcp/server_initialized': {
        const notificationParams = params as ExtNotificationParams;
        const serverName = notificationParams.serverName;
        if (serverName && !this.mcpServers.includes(serverName)) {
          this.mcpServers.push(serverName);
        }
        this.logger.debug('[ACPBridge] MCP server initialized', { serverName });
        break;
      }
      case '_kiro.dev/mcp/oauth_request': {
        const notificationParams = params as ExtNotificationParams;
        const url = notificationParams.url;
        this.logger.info('[ACPBridge] MCP OAuth requested', { url });
        // Surface to UI as an ephemeral message with a clickable link
        if (this.activeWriter && url) {
          this.activeWriter({
            type: 'text-delta',
            text: `\n\n🔐 **Authentication required** — An MCP server needs you to sign in:\n[Open authentication page](${url})\n\n`,
          }).catch((e) => this.logger.error('[acp] cleanup failed:', e));
        }
        break;
      }
      case '_kiro.dev/compaction/status':
      case '_kiro.dev/clear/status': {
        const status = (params as any).status || 'done';
        const message =
          (params as any).message ||
          (method.includes('compaction')
            ? 'Context compacted.'
            : 'History cleared.');
        if (this.activeWriter) {
          this.activeWriter({ type: 'text-delta', text: `${message}\n` }).catch(
            () => {},
          );
          this.responseAccumulator += `${message}\n`;
        }
        this.logger.info('[ACPBridge] Session maintenance', { method, status });
        break;
      }
      default:
        // Stream any unknown extension notification text to the user if we have an active writer
        if (this.activeWriter && params) {
          const text =
            (params as any).message ||
            (params as any).text ||
            (params as any).status;
          if (text && typeof text === 'string') {
            this.activeWriter({ type: 'text-delta', text: `${text}\n` }).catch(
              () => {},
            );
            this.responseAccumulator += `${text}\n`;
          }
        }
        this.logger.debug('[ACPBridge] Extension notification', {
          method,
          params,
        });
        break;
    }
  }

  private handleExtMethod(
    method: string,
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (method) {
      case '_kiro.dev/metadata':
        // kiro-cli sends metadata about the session — extract config options if present
        if (
          Array.isArray((params as any).configOptions) &&
          (params as any).configOptions.length > 0
        ) {
          this.configOptions = (params as any).configOptions;
          this.logger.info('[ACPBridge] Config options updated from metadata', {
            count: this.configOptions.length,
          });
        }
        return {};
      case '_kiro.dev/commands/execute':
        // kiro-cli asking us to execute a command — pass through
        this.logger.debug('[ACPBridge] Command execute request', { params });
        return {};
      case '_kiro.dev/commands/options':
        // Autocomplete request — return empty for now
        return { options: [] };
      default:
        this.logger.debug('[ACPBridge] Unknown extension method', { method });
        return {};
    }
  }

  // ── Helpers ────────────────────────────────────────────────────

  private async findCommand(): Promise<string | null> {
    const { execSync } = await import('node:child_process');
    const cmd = process.platform === 'win32'
      ? `where ${this.config.command}`
      : `which ${this.config.command}`;
    try {
      return execSync(cmd, {
        encoding: 'utf-8',
        windowsHide: true,
      }).trim().split('\n')[0]; // `where` on Windows can return multiple lines
    } catch (e) {
      this.logger.debug('Failed to find command on PATH', { command: this.config.command, error: e });
      return null;
    }
  }

  /** Get or create a memory adapter for an ACP agent slug */
  private getOrCreateAdapter(slug: string): FileMemoryAdapter | null {
    if (!this.memoryAdapters || !this.createMemoryAdapter) return null;
    let adapter = this.memoryAdapters.get(slug);
    if (!adapter) {
      adapter = this.createMemoryAdapter(slug);
      this.memoryAdapters.set(slug, adapter);
    }
    return adapter;
  }

  /** Get current model display name from configOptions or CLI settings */
  private getCurrentModelName(): string | null {
    // Prefer configOptions (standard ACP)
    const modelOption = this.configOptions.find(
      (o: any) => o.category === 'model',
    );
    if (modelOption) {
      const current = modelOption.options?.find(
        (o: any) => o.value === modelOption.currentValue,
      );
      return current?.name || modelOption.currentValue || null;
    }
    return this.detectedModel;
  }

  /** Detect model from CLI settings (fallback when configOptions not available) */
  private async detectModelFromCli(): Promise<void> {
    try {
      const { execSync } = await import('node:child_process');
      const output = execSync(`${this.config.command} settings list`, {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      });
      const match = output.match(/chat\.defaultModel\s*=\s*"([^"]+)"/);
      if (match) {
        this.detectedModel = match[1];
        this.logger.debug(
          `[ACP:${this.prefix}] Detected model: ${this.detectedModel}`,
        );
      }
    } catch (e) {
      this.logger.debug('Failed to detect model from CLI settings', { error: e });
      /* ignore */
    }
  }

  private cleanup(): void {
    const cancelled = this.approvalRegistry.cancelAll();
    if (cancelled > 0) {
      this.logger.info(
        `[ACP:${this.prefix}] Cancelled ${cancelled} pending approvals on cleanup`,
      );
      approvalOps.add(cancelled, { operation: 'cancel-cleanup' });
    }
    for (const [, term] of Array.from(this.terminals)) {
      term.process.kill();
    }
    this.terminals.clear();
    this.intentionalKill = true;
    if (this.proc) {
      const p = this.proc;
      p.kill('SIGTERM');
      setTimeout(() => { try { p.kill('SIGKILL'); } catch {} }, 5000);
    }
    this.proc = null;
    this.connection = null;
    this.sessionId = null;
    this.modes = [];
    this.slashCommands = [];
    this.mcpServers = [];
    this.configOptions = [];
    this.currentModeId = null;
  }
}

/** Format a diff as a readable markdown code block */
function formatDiff(
  path: string,
  oldText: string | null,
  newText: string,
): string {
  if (!oldText) return `**New file:** \`${path}\`\n\`\`\`\n${newText}\n\`\`\``;
  return `**Modified:** \`${path}\`\n\`\`\`diff\n${simpleDiff(oldText, newText)}\n\`\`\``;
}

/** Minimal line-level diff */
function simpleDiff(oldText: string, newText: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const lines: string[] = [];
  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i++) {
    if (i >= oldLines.length) {
      lines.push(`+ ${newLines[i]}`);
    } else if (i >= newLines.length) {
      lines.push(`- ${oldLines[i]}`);
    } else if (oldLines[i] !== newLines[i]) {
      lines.push(`- ${oldLines[i]}`);
      lines.push(`+ ${newLines[i]}`);
    } else {
      lines.push(`  ${oldLines[i]}`);
    }
  }
  return lines.join('\n');
}

// ── ACPManager ───────────────────────────────────────────────────

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

  /** Create probes for all enabled configs and run initial discovery */
  async startAll(configs: ACPConnectionConfig[]): Promise<void> {
    await Promise.all(configs.map((cfg) => this.addConnection(cfg)));
    this.probeTimer = setInterval(() => this.runProbes(), 60_000);
    this.cullTimer = setInterval(() => this.sweepIdleSessions(), 30_000);
  }

  /** Run probes for all sources (skipped if sessions are active) */
  private async runProbes(): Promise<void> {
    if (this.sessions.size > 0) return;
    const before = this.getVirtualAgents().length;
    await Promise.all(
      Array.from(this.probes.values()).map((p) => p.probe()),
    );
    if (this.getVirtualAgents().length !== before) {
      this.eventBus?.emit('agents:changed');
    }
  }

  private async sweepIdleSessions(): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (session.isIdle()) {
        await session.cullSession();
        this.sessions.delete(id);
      }
    }
  }

  /** Add a source: create probe and run initial discovery */
  async addConnection(config: ACPConnectionConfig): Promise<boolean> {
    if (this.probes.has(config.id)) {
      await this.removeConnection(config.id);
    }
    this.configs.set(config.id, config);
    const probe = new ACPProbe(config, this.logger, this.cwd);
    this.probes.set(config.id, probe);
    const ok = await probe.probe();
    if (ok) this.eventBus?.emit('agents:changed');
    return ok;
  }

  /** Remove a source and kill its associated sessions */
  async removeConnection(id: string): Promise<void> {
    this.probes.delete(id);
    this.configs.delete(id);
    for (const [convId, session] of this.sessions) {
      if (session.config.id === id) {
        await session.shutdown();
        this.sessions.delete(convId);
      }
    }
  }

  /** Re-probe a source */
  async reconnect(id: string): Promise<boolean> {
    const probe = this.probes.get(id);
    if (!probe) return false;
    const ok = await probe.probe();
    if (ok) this.eventBus?.emit('agents:changed');
    return ok;
  }

  /** Shutdown everything */
  async shutdown(): Promise<void> {
    if (this.probeTimer) { clearInterval(this.probeTimer); this.probeTimer = null; }
    if (this.cullTimer) { clearInterval(this.cullTimer); this.cullTimer = null; }
    await Promise.all(
      Array.from(this.sessions.values()).map((s) => s.shutdown()),
    );
    this.sessions.clear();
    this.probes.clear();
    this.configs.clear();
  }

  // ── Delegated methods ──

  hasAgent(slug: string): boolean {
    return Array.from(this.probes.entries()).some(([id, probe]) =>
      probe.getModes().some((m) => `${id}-${m.id}` === slug),
    );
  }

  getVirtualAgents(): any[] {
    return Array.from(this.probes.entries()).flatMap(([id, probe]) => {
      const config = this.configs.get(id);
      const configOptions = probe.getConfigOptions();
      const modelConfig = configOptions.find((o: any) => o.category === 'model');
      const modelOptions = modelConfig?.options?.map((o: any) => ({
        id: o.value ?? o,
        name: o.name ?? o,
        originalId: o.value ?? o,
      })) || null;
      const capabilities = probe.getCapabilities();

      return probe.getModes().map((mode) => ({
        slug: `${id}-${mode.id}`,
        name: mode.name || mode.id,
        description: mode.description || `${config?.name || id} ${mode.id} mode`,
        model: modelConfig?.currentValue || config?.name || id,
        icon: config?.icon || '🔌',
        source: 'acp' as const,
        connectionId: id,
        connectionName: config?.name || id,
        connectionIcon: config?.icon,
        updatedAt: new Date().toISOString(),
        supportsAttachments: capabilities?.image || false,
        modelOptions,
      }));
    });
  }

  isConnected(): boolean {
    return Array.from(this.probes.values()).some((p) => p.isAvailable());
  }

  getSlashCommands(slug: string): any[] {
    const session = this.findSessionForSlug(slug);
    return session?.getSlashCommands(slug) || [];
  }

  async getCommandOptions(slug: string, partialCommand: string): Promise<any[]> {
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
    const configId = this.findConfigIdForSlug(slug);
    if (!configId) return c.json({ success: false, error: 'ACP agent not found' }, 503);

    const conversationId = context?.conversationId || options.conversationId ||
      `anon:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    const sessionCwd = context?.cwd || homedir();

    let session = this.sessions.get(conversationId);
    if (!session) {
      const config = this.configs.get(configId)!;
      session = new ACPConnection(
        config,
        this.approvalRegistry,
        this.logger,
        sessionCwd,
        conversationId,
        this.memoryAdapters,
        this.createMemoryAdapter,
        this.usageAggregatorRef,
        this.eventBus,
        this.monitoringEvents,
        this.persistEvent,
        this.monitoringEmitter,
      );
      this.sessions.set(conversationId, session);
    }

    return session.handleChat(c, slug, input, options, context);
  }

  /** Status: probe availability per source + active session count */
  getStatus(): {
    connections: Array<{
      id: string;
      name: string;
      icon?: string;
      status: string;
      modes: string[];
      sessionId: null;
      mcpServers: string[];
      configOptions: any[];
      currentModel: string | null;
    }>;
    activeSessions: number;
  } {
    return {
      connections: Array.from(this.probes.entries()).map(([id, probe]) => {
        const config = this.configs.get(id);
        const configOptions = probe.getConfigOptions();
        const modelConfig = configOptions.find((o: any) => o.category === 'model');
        return {
          id,
          name: config?.name || id,
          icon: config?.icon,
          status: probe.isAvailable() ? ACPStatus.AVAILABLE : (probe.lastProbeAt > 0 ? ACPStatus.UNAVAILABLE : ACPStatus.PROBING),
          modes: probe.getModes().map((m) => m.id),
          sessionId: null,
          mcpServers: [],
          configOptions,
          currentModel: modelConfig?.currentValue || null,
        };
      }),
      activeSessions: this.sessions.size,
    };
  }

  private findConfigIdForSlug(slug: string): string | undefined {
    for (const [id, probe] of this.probes) {
      if (probe.getModes().some((m) => `${id}-${m.id}` === slug)) return id;
    }
    return undefined;
  }

  private findSessionForSlug(slug: string): ACPConnection | undefined {
    return Array.from(this.sessions.values()).find((s) => s.hasAgent(slug));
  }
}
