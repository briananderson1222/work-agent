import type { Prerequisite, ToolDef } from '@stallion-ai/contracts/tool';

export interface LLMModel {
  id: string;
  name: string;
  contextWindow?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: unknown }>;
}

export interface LLMStreamOpts {
  model: string;
  messages: LLMMessage[];
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LLMStreamChunk {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'finish' | 'error';
  content?: string;
  toolCall?: { id: string; name: string; arguments: unknown };
  toolResult?: { id: string; result: unknown };
  finishReason?: string;
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
}

export interface ILLMProvider {
  readonly id: string;
  readonly displayName: string;
  listModels(): Promise<LLMModel[]>;
  createStream(opts: LLMStreamOpts): AsyncIterable<LLMStreamChunk>;
  supportsStreaming?(): boolean;
  supportsToolCalling?(): boolean;
  healthCheck?(): Promise<boolean>;
  getPrerequisites?(): Promise<Prerequisite[]>;
}

export interface IEmbeddingProvider {
  readonly id: string;
  readonly displayName: string;
  embed(texts: string[]): Promise<number[][]>;
  dimensions(): number;
  healthCheck?(): Promise<boolean>;
  getPrerequisites?(): Promise<Prerequisite[]>;
}

export interface VectorDocument {
  id: string;
  vector: number[];
  text: string;
  metadata: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface IVectorDbProvider {
  readonly id: string;
  readonly displayName: string;
  createNamespace(namespace: string): Promise<void>;
  deleteNamespace(namespace: string): Promise<void>;
  namespaceExists(namespace: string): Promise<boolean>;
  addDocuments(namespace: string, docs: VectorDocument[]): Promise<void>;
  deleteDocuments(namespace: string, docIds: string[]): Promise<void>;
  search(
    namespace: string,
    query: number[],
    topK: number,
    threshold?: number,
  ): Promise<VectorSearchResult[]>;
  getByMetadata(
    namespace: string,
    key: string,
    value: string,
  ): Promise<VectorSearchResult[]>;
  count(namespace: string): Promise<number>;
}
