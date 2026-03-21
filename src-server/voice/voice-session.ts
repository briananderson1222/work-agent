import { randomUUID } from 'crypto';
import type { WebSocket } from 'ws';
import type { IS2SProvider, S2SSessionConfig, S2SToolDefinition } from './s2s-types.js';

export type S2SProviderFactory = (config?: any) => IS2SProvider;
export type VoiceToolExecutor = (toolName: string, params: Record<string, unknown>) => Promise<string>;

const DEFAULT_SYSTEM_PROMPT =
  'You are a voice assistant. Be concise — this is voice, not text. Short sentences. Confirm before creating or modifying anything.';

class VoiceSession {
  private provider: IS2SProvider;

  constructor(
    readonly id: string,
    private ws: WebSocket,
    providerFactory: S2SProviderFactory,
    private toolExecutor?: VoiceToolExecutor,
  ) {
    this.provider = providerFactory();

    this.provider.on('audio', (chunk) => this.send({ type: 'audio_out', data: chunk.toString('base64') }));
    this.provider.on('transcript', (t) => this.send({ type: 'transcript', ...t }));
    this.provider.on('stateChange', (state) => this.send({ type: 'state', state }));
    this.provider.on('error', (err) => this.send({ type: 'error', message: err.message }));
    this.provider.on('toolUse', async (e) => {
      const result = this.toolExecutor
        ? await this.toolExecutor(e.toolName, e.parameters)
        : `No tool executor configured for ${e.toolName}`;
      this.provider.sendToolResult(e.toolUseId, result);
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'audio_in') this.provider.sendAudio(Buffer.from(msg.data, 'base64'));
      } catch {}
    });

    ws.on('close', () => this.destroy());
  }

  async start(config: S2SSessionConfig): Promise<void> {
    const inputAudioFormat = await this.provider.connect(config);
    this.send({ type: 'session_ready', inputAudioFormat, outputAudioFormat: this.provider.outputAudioFormat });
  }

  async destroy(): Promise<void> {
    await this.provider.disconnect();
  }

  private send(msg: object): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }
}

export interface VoiceSessionOptions {
  providerFactory: S2SProviderFactory;
  toolExecutor?: VoiceToolExecutor;
  defaultSystemPrompt?: string;
  defaultTools?: S2SToolDefinition[];
}

export class VoiceSessionService {
  private sessions = new Map<string, VoiceSession>();

  constructor(private opts: VoiceSessionOptions) {}

  createSession(ws: WebSocket, config?: Partial<S2SSessionConfig>): string {
    const id = randomUUID();
    const session = new VoiceSession(id, ws, this.opts.providerFactory, this.opts.toolExecutor);
    this.sessions.set(id, session);

    const fullConfig: S2SSessionConfig = {
      systemPrompt: this.opts.defaultSystemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      tools: this.opts.defaultTools ?? [],
      ...config,
    };

    session.start(fullConfig).catch((err) => {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
      this.destroySession(id);
    });

    return id;
  }

  destroySession(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.destroy();
      this.sessions.delete(id);
    }
  }

  getActiveCount(): number {
    return this.sessions.size;
  }
}
