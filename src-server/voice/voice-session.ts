import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { IS2SProvider, S2SSessionConfig, S2SToolDefinition } from './s2s-types.js';
import { voiceOps } from '../telemetry/metrics.js';

export type S2SProviderFactory = (config?: any) => IS2SProvider;

const VOICE_PROMPT_PREFIX = 'You are in voice mode. Be concise — short sentences. Confirm before creating or modifying anything.\n\n';

/** Translate an agent's MCP tool to S2S tool definition */
function toS2STool(tool: { name: string; description?: string; parameters?: any }): S2SToolDefinition | null {
  let inputSchema = tool.parameters;
  if (!inputSchema || typeof inputSchema !== 'object') {
    inputSchema = { type: 'object', properties: {} };
  } else if ('_def' in inputSchema || '_type' in inputSchema || typeof inputSchema.parse === 'function') {
    // Zod schema — can't serialize directly, use empty schema
    inputSchema = { type: 'object', properties: {} };
  } else {
    // Ensure it's a plain JSON-serializable object
    try { inputSchema = JSON.parse(JSON.stringify(inputSchema)); } catch { inputSchema = { type: 'object', properties: {} }; }
  }
  if (!tool.description) return null; // Skip tools without descriptions — S2S models need them
  return { name: tool.name, description: tool.description, inputSchema };
}

export interface VoiceSessionOptions {
  providerFactory: S2SProviderFactory;
  /** Live reference to the runtime's agent tools map */
  agentTools: Map<string, any[]>;
  /** Live reference to the runtime's agent specs map */
  agentSpecs: Map<string, { systemPrompt?: string; [k: string]: any }>;
  /** Which agent to use for voice. Default: 'stallion-voice' */
  voiceAgentSlug?: string;
  /** Called once on first session to bootstrap the voice agent and load tools */
  onFirstSession?: () => Promise<void>;
}

class VoiceSession {
  private provider: IS2SProvider;
  private tools: any[]; // The agent's tool objects (with .execute)

  constructor(
    readonly id: string,
    private ws: WebSocket,
    providerFactory: S2SProviderFactory,
    tools: any[],
  ) {
    this.provider = providerFactory();
    this.tools = tools;

    this.provider.on('audio', (chunk) => this.send({ type: 'audio_out', data: chunk.toString('base64') }));
    this.provider.on('transcript', (t) => this.send({ type: 'transcript', ...t }));
    this.provider.on('stateChange', (state) => this.send({ type: 'state', state }));
    this.provider.on('error', (err) => this.send({ type: 'error', message: err.message }));
    this.provider.on('toolUse', async (e) => {
      voiceOps.add(1, { op: 'tool.call' });
      const tool = this.tools.find(t => t.name === e.toolName);
      let result: string;
      if (tool) {
        try {
          const raw = await tool.execute(e.parameters);
          result = typeof raw === 'string' ? raw : JSON.stringify(raw);
        } catch (err: any) {
          result = `Tool error: ${err.message}`;
        }
      } else {
        result = `Tool not found: ${e.toolName}`;
      }
      this.provider.sendToolResult(e.toolUseId, result);
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'audio_in') this.provider.sendAudio(Buffer.from(msg.data, 'base64'));
      } catch (err) {
        console.warn('[VoiceSession] Failed to parse client WS message:', err);
      }
    });

    ws.on('close', () => { voiceOps.add(1, { op: 'ws.disconnect' }); this.destroy(); });
  }

  async start(config: S2SSessionConfig): Promise<void> {
    const inputAudioFormat = await this.provider.connect(config);
    this.send({ type: 'session_ready', inputAudioFormat, outputAudioFormat: this.provider.outputAudioFormat });
  }

  async destroy(): Promise<void> {
    this.provider.removeAllListeners();
    if (typeof this.ws.removeAllListeners === 'function') this.ws.removeAllListeners();
    await this.provider.disconnect();
  }

  private send(msg: object): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }
}

export class VoiceSessionService {
  private sessions = new Map<string, VoiceSession>();
  private slug: string;
  private bootstrapped = false;

  constructor(private opts: VoiceSessionOptions) {
    this.slug = opts.voiceAgentSlug ?? 'stallion-voice';
  }

  createSession(ws: WebSocket, config?: Partial<S2SSessionConfig> & { agentSlug?: string }): string {
    const id = randomUUID();
    const agentSlug = config?.agentSlug ?? this.slug;

    const startSession = () => {
      const tools = this.opts.agentTools.get(agentSlug) ?? [];
      const spec = this.opts.agentSpecs.get(agentSlug);

      const session = new VoiceSession(id, ws, this.opts.providerFactory, tools);
      this.sessions.set(id, session);
      voiceOps.add(1, { op: 'ws.connect' });

      const s2sTools = tools.map(toS2STool).filter((t): t is S2SToolDefinition => t !== null);
      const systemPrompt = VOICE_PROMPT_PREFIX + (spec?.systemPrompt ?? '');

      const fullConfig: S2SSessionConfig = {
        systemPrompt,
        tools: s2sTools,
        ...config,
      };

      session.start(fullConfig).catch((err) => {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
        this.destroySession(id);
      });
    };

    if (!this.bootstrapped && this.opts.onFirstSession) {
      this.bootstrapped = true;
      this.opts.onFirstSession().then(startSession).catch((err) => {
        ws.send(JSON.stringify({ type: 'error', message: `Voice bootstrap failed: ${err.message}` }));
      });
    } else {
      startSession();
    }

    return id;
  }

  destroySession(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.destroy();
      this.sessions.delete(id);
    }
  }

  async stop(): Promise<void> {
    await Promise.all(
      Array.from(this.sessions.values()).map((s) => s.destroy()),
    );
    this.sessions.clear();
  }

  getActiveCount(): number {
    return this.sessions.size;
  }
}
