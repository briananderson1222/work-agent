/**
 * ACPProcess — thin wrapper around a single kiro-cli ACP child process.
 * Handles: spawn, JSON-RPC transport, protocol init, session lifecycle, destroy.
 * Used by ACPConnection for both discovery and per-conversation chat processes.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import {
  type Client,
  ClientSideConnection,
  type ContentBlock,
  type McpServer,
  ndJsonStream,
  PROTOCOL_VERSION,
} from '@agentclientprotocol/sdk';

export interface ACPProcessOptions {
  command: string;
  args?: string[];
  cwd: string;
  /** Factory for the Client callbacks — called during connection setup */
  createClient: (agent: any) => Client;
  logger: any;
}

interface InitializeResult {
  protocolVersion: number;
  agentInfo?: { name: string; version?: string };
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
    availableModes: Array<{ id: string; name: string; description?: string }>;
    currentModeId?: string;
  };
  configOptions?: any[];
}

export class ACPProcess extends EventEmitter {
  private proc: ChildProcess | null = null;
  private connection: ClientSideConnection | null = null;
  private _sessionId: string | null = null;
  private _initResult: InitializeResult | null = null;
  private destroyed = false;

  get sessionId(): string | null {
    return this._sessionId;
  }
  get initResult(): InitializeResult | null {
    return this._initResult;
  }
  get isAlive(): boolean {
    return this.proc !== null && !this.destroyed;
  }

  constructor(private opts: ACPProcessOptions) {
    super();
  }

  /** Spawn the child process, set up transport, initialize ACP protocol. */
  async start(): Promise<InitializeResult> {
    if (this.destroyed) throw new Error('ACPProcess already destroyed');
    if (this.proc) throw new Error('ACPProcess already started');

    const bin = await this.findCommand();
    if (!bin) throw new Error(`${this.opts.command} not found on PATH`);

    this.proc = spawn(bin, this.opts.args || [], {
      stdio: ['pipe', 'pipe', 'inherit'],
      cwd: this.opts.cwd,
      windowsHide: true,
    });

    this.proc.on('exit', (code) => {
      this.opts.logger.debug('[ACPProcess] exited', { code });
      this.proc = null;
      this.connection = null;
      this._sessionId = null;
      this.emit('exit', code);
    });

    const input = Writable.toWeb(this.proc.stdin!);
    const output = Readable.toWeb(
      this.proc.stdout!,
    ) as ReadableStream<Uint8Array>;
    const acpStream = ndJsonStream(input, output);

    this.connection = new ClientSideConnection(
      (agent) => this.opts.createClient(agent),
      acpStream,
    );

    this._initResult = (await this.connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      clientInfo: { name: 'stallion', version: '1.0.0' },
    })) as InitializeResult;

    return this._initResult;
  }

  /** Create a new ACP session. */
  async newSession(
    cwd: string,
    mcpServers: McpServer[] = [],
  ): Promise<SessionResult> {
    if (!this.connection) throw new Error('ACPProcess not started');
    const result = (await this.connection.newSession({
      cwd,
      mcpServers,
    })) as SessionResult;
    this._sessionId = result.sessionId;
    return result;
  }

  /** Load an existing session by ID. */
  async loadSession(
    sessionId: string,
    cwd: string,
    mcpServers: McpServer[] = [],
  ): Promise<void> {
    if (!this.connection) throw new Error('ACPProcess not started');
    await this.connection.loadSession({ sessionId, cwd, mcpServers });
    this._sessionId = sessionId;
  }

  /** Set the active mode for the current session. */
  async setMode(modeId: string): Promise<void> {
    if (!this.connection || !this._sessionId)
      throw new Error('No active session');
    await this.connection.setSessionMode({
      sessionId: this._sessionId,
      modeId,
    });
  }

  /** Set a config option (e.g., model) for the current session. */
  async setConfigOption(configId: string, value: string): Promise<any> {
    if (!this.connection || !this._sessionId)
      throw new Error('No active session');
    return this.connection.setSessionConfigOption({
      sessionId: this._sessionId,
      configId,
      value,
    });
  }

  /** Send a prompt to the current session. */
  async prompt(
    content: ContentBlock[],
  ): Promise<void> {
    if (!this.connection || !this._sessionId)
      throw new Error('No active session');
    await this.connection.prompt({
      sessionId: this._sessionId,
      prompt: content,
    });
  }

  /** Cancel the current prompt. */
  async cancel(): Promise<void> {
    if (!this.connection || !this._sessionId) return;
    await this.connection.cancel({ sessionId: this._sessionId });
  }

  /** Call an extension method on the connection. */
  async extMethod(
    method: string,
    params: Record<string, unknown>,
  ): Promise<any> {
    if (!this.connection) throw new Error('ACPProcess not started');
    return (this.connection as any).extMethod(method, params);
  }

  /** Destroy the process: SIGTERM → 500ms → SIGKILL. */
  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.proc) {
      this.proc.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (this.proc) {
            this.proc.kill('SIGKILL');
          }
          resolve();
        }, 500);
        if (this.proc) {
          this.proc.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        } else {
          clearTimeout(timer);
          resolve();
        }
      });
    }

    this.proc = null;
    this.connection = null;
    this._sessionId = null;
  }

  private async findCommand(): Promise<string | null> {
    const { execSync } = await import('node:child_process');
    const cmd =
      process.platform === 'win32'
        ? `where ${this.opts.command}`
        : `which ${this.opts.command}`;
    try {
      return execSync(cmd, { encoding: 'utf-8', windowsHide: true })
        .trim()
        .split('\n')[0];
    } catch {
      return null;
    }
  }
}
