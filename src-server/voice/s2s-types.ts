import { EventEmitter } from 'node:events';

export type S2SAudioFormat = {
  mediaType: string;
  sampleRateHertz: number;
  sampleSizeBits: number;
  channelCount: number;
  encoding: 'base64' | 'raw';
};

export type S2SToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type S2SSessionConfig = {
  systemPrompt: string;
  tools: S2SToolDefinition[];
  voice?: string;
  inputAudio?: Partial<S2SAudioFormat>;
  outputAudio?: Partial<S2SAudioFormat>;
};

export type S2STranscript = {
  text: string;
  role: 'user' | 'assistant';
  stage: 'speculative' | 'final';
};

export type S2SToolUseEvent = {
  toolName: string;
  toolUseId: string;
  parameters: Record<string, unknown>;
};

export type S2SProviderState =
  | 'disconnected'
  | 'connecting'
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking';

export type S2SEventMap = {
  audio: (chunk: Buffer) => void;
  transcript: (t: S2STranscript) => void;
  toolUse: (e: S2SToolUseEvent) => void;
  turnStart: () => void;
  turnEnd: () => void;
  stateChange: (state: S2SProviderState) => void;
  error: (err: Error) => void;
};

export interface IS2SProvider extends EventEmitter {
  connect(config: S2SSessionConfig): Promise<S2SAudioFormat>;
  sendAudio(chunk: Buffer): void;
  sendToolResult(toolUseId: string, result: string): void;
  disconnect(): Promise<void>;
  readonly state: S2SProviderState;
  readonly outputAudioFormat: S2SAudioFormat;

  on<K extends keyof S2SEventMap>(event: K, listener: S2SEventMap[K]): this;
  off<K extends keyof S2SEventMap>(event: K, listener: S2SEventMap[K]): this;
  once<K extends keyof S2SEventMap>(event: K, listener: S2SEventMap[K]): this;
}

export type VoiceWsMessage =
  | { type: 'audio_in'; data: string }
  | { type: 'audio_out'; data: string }
  | {
      type: 'transcript';
      text: string;
      role: 'user' | 'assistant';
      stage: 'speculative' | 'final';
    }
  | { type: 'state'; state: S2SProviderState }
  | { type: 'error'; message: string }
  | {
      type: 'session_ready';
      inputAudioFormat: S2SAudioFormat;
      outputAudioFormat: S2SAudioFormat;
    };
