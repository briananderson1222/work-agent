import { EventEmitter } from 'node:events';
import { BedrockRuntimeClient, InvokeModelWithBidirectionalStreamCommand, type InvokeModelWithBidirectionalStreamInput } from '@aws-sdk/client-bedrock-runtime';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import type { IS2SProvider, S2SAudioFormat, S2SSessionConfig, S2SProviderState } from '../s2s-types.js';

const DEFAULT_MODEL = 'amazon.nova-2-sonic-v1:0';
const DEFAULT_REGION = 'us-east-1';

const INPUT_FORMAT: S2SAudioFormat = { mediaType: 'audio/lpcm', sampleRateHertz: 16000, sampleSizeBits: 16, channelCount: 1, encoding: 'base64' };
const OUTPUT_FORMAT: S2SAudioFormat = { mediaType: 'audio/lpcm', sampleRateHertz: 24000, sampleSizeBits: 16, channelCount: 1, encoding: 'base64' };

function uuid() { return crypto.randomUUID(); }
function enc(obj: unknown): InvokeModelWithBidirectionalStreamInput {
  return { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ event: obj })) } };
}

type QueueItem = InvokeModelWithBidirectionalStreamInput | null; // null = done

export class NovaSonicProvider extends EventEmitter implements IS2SProvider {
  private client: BedrockRuntimeClient;
  private _state: S2SProviderState = 'disconnected';
  private promptName = '';
  private audioContentName = '';
  private queue: QueueItem[] = [];
  private queueResolve: (() => void) | null = null;
  private active = false;
  // Per-response tracking
  private currentRole = '';
  private currentGenerationStage = '';
  private currentToolName = '';
  private currentToolUseId = '';
  private currentToolContent = '';

  readonly outputAudioFormat = OUTPUT_FORMAT;

  constructor(opts: { region?: string; modelId?: string } = {}) {
    super();
    this.client = new BedrockRuntimeClient({
      region: opts.region ?? DEFAULT_REGION,
      requestHandler: new NodeHttp2Handler({ requestTimeout: 300_000, sessionTimeout: 300_000 }),
    });
    (this as any)._modelId = opts.modelId ?? DEFAULT_MODEL;
  }

  get state() { return this._state; }

  private setState(s: S2SProviderState) {
    this._state = s;
    this.emit('stateChange', s);
  }

  private push(chunk: QueueItem) {
    this.queue.push(chunk);
    this.queueResolve?.();
    this.queueResolve = null;
  }

  private async *eventStream(): AsyncGenerator<InvokeModelWithBidirectionalStreamInput> {
    while (true) {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!;
        if (item === null) return;
        yield item;
        await new Promise<void>(r => setTimeout(r, 30));
      }
      await new Promise<void>(r => { this.queueResolve = r; });
    }
  }

  async connect(config: S2SSessionConfig): Promise<S2SAudioFormat> {
    this.setState('connecting');
    this.active = true;
    this.promptName = uuid();
    const systemContentName = uuid();
    this.audioContentName = uuid();
    const voice = config.voice ?? 'matthew';

    const tools = (config.tools ?? []).map(t => ({
      toolSpec: { name: t.name, description: t.description, inputSchema: { json: JSON.stringify(t.inputSchema) } },
    }));

    // Seed setup events into queue before starting stream
    this.push(enc({ sessionStart: { inferenceConfiguration: { maxTokens: 1024, topP: 0.9, temperature: 0.7 } } }));
    this.push(enc({
      promptStart: {
        promptName: this.promptName,
        textOutputConfiguration: { mediaType: 'text/plain' },
        audioOutputConfiguration: { mediaType: 'audio/lpcm', sampleRateHertz: 24000, sampleSizeBits: 16, channelCount: 1, voiceId: voice, encoding: 'base64', audioType: 'SPEECH' },
        ...(tools.length > 0 && {
          toolUseOutputConfiguration: { mediaType: 'application/json' },
          toolConfiguration: { tools, toolChoice: { auto: {} } },
        }),
      },
    }));
    // System prompt
    this.push(enc({ contentStart: { promptName: this.promptName, contentName: systemContentName, type: 'TEXT', interactive: false, role: 'SYSTEM', textInputConfiguration: { mediaType: 'text/plain' } } }));
    this.push(enc({ textInput: { promptName: this.promptName, contentName: systemContentName, content: config.systemPrompt } }));
    this.push(enc({ contentEnd: { promptName: this.promptName, contentName: systemContentName } }));
    // Open audio content block
    this.push(enc({ contentStart: { promptName: this.promptName, contentName: this.audioContentName, type: 'AUDIO', interactive: true, role: 'USER', audioInputConfiguration: { mediaType: 'audio/lpcm', sampleRateHertz: 16000, sampleSizeBits: 16, channelCount: 1, audioType: 'SPEECH', encoding: 'base64' } } }));

    const cmd = new InvokeModelWithBidirectionalStreamCommand({
      modelId: (this as any)._modelId,
      body: this.eventStream(),
    });

    const response = await this.client.send(cmd);
    this.setState('listening');
    if (!response.body) throw new Error('No response body from Bedrock');
    this.processStream(response.body).catch(err => this.emit('error', err));
    return INPUT_FORMAT;
  }

  private async processStream(body: AsyncIterable<any>) {
    try {
      for await (const raw of body) {
        if (!this.active) break;
        let event: any;
        try {
          const bytes = raw.chunk?.bytes;
          if (!bytes) continue;
          event = JSON.parse(new TextDecoder().decode(bytes))?.event;
          if (!event) continue;
        } catch { continue; }

        if (event.completionStart) {
          this.emit('turnStart');
          this.setState('processing');
        } else if (event.contentStart) {
          const cs = event.contentStart;
          this.currentRole = cs.role ?? '';
          this.currentGenerationStage = cs.additionalModelFields ? JSON.parse(cs.additionalModelFields)?.generationStage ?? '' : '';
          this.currentContentType = cs.type ?? '';
          this.currentToolName = '';
          this.currentToolUseId = '';
          this.currentToolContent = '';
          if (cs.type === 'AUDIO') this.setState('speaking');
        } else if (event.textOutput) {
          const text: string = event.textOutput.content ?? '';
          const role = this.currentRole.toLowerCase() as 'user' | 'assistant';
          const stage = this.currentGenerationStage.toLowerCase() as 'speculative' | 'final';
          if (role === 'user' && stage === 'final') this.emit('transcript', { text, role: 'user', stage: 'final' });
          else if (role === 'assistant' && stage === 'speculative') this.emit('transcript', { text, role: 'assistant', stage: 'speculative' });
          else if (role === 'assistant' && stage === 'final') this.emit('transcript', { text, role: 'assistant', stage: 'final' });
        } else if (event.audioOutput) {
          this.emit('audio', Buffer.from(event.audioOutput.content, 'base64'));
        } else if (event.toolUse) {
          this.currentToolName = event.toolUse.toolName ?? this.currentToolName;
          this.currentToolUseId = event.toolUse.toolUseId ?? this.currentToolUseId;
          this.currentToolContent += event.toolUse.content ?? '';
        } else if (event.contentEnd) {
          if (event.contentEnd.stopReason === 'TOOL_USE' && this.currentToolUseId) {
            try {
              this.emit('toolUse', { toolName: this.currentToolName, toolUseId: this.currentToolUseId, parameters: JSON.parse(this.currentToolContent || '{}') });
            } catch { this.emit('toolUse', { toolName: this.currentToolName, toolUseId: this.currentToolUseId, parameters: {} }); }
          }
        } else if (event.completionEnd) {
          this.emit('turnEnd');
          this.setState('listening');
        }
      }
    } catch (err: any) {
      if (this.active) this.emit('error', err);
    }
  }

  sendAudio(chunk: Buffer) {
    if (!this.active) return;
    this.push(enc({ audioInput: { promptName: this.promptName, contentName: this.audioContentName, content: chunk.toString('base64') } }));
  }

  sendToolResult(toolUseId: string, result: string) {
    if (!this.active) return;
    const contentName = uuid();
    this.push(enc({ contentStart: { promptName: this.promptName, contentName, role: 'TOOL', type: 'TOOL', toolResultInputConfiguration: { toolUseId, type: 'TEXT', textInputConfiguration: { mediaType: 'text/plain' } } } }));
    this.push(enc({ toolResult: { promptName: this.promptName, contentName, content: result } }));
    this.push(enc({ contentEnd: { promptName: this.promptName, contentName } }));
  }

  async disconnect() {
    if (!this.active) return;
    this.active = false;
    this.push(enc({ contentEnd: { promptName: this.promptName, contentName: this.audioContentName } }));
    this.push(enc({ promptEnd: { promptName: this.promptName } }));
    this.push(enc({ sessionEnd: {} }));
    this.push(null);
    this.setState('disconnected');
  }
}
