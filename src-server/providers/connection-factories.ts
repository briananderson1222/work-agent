import type { ProviderConnectionConfig } from '@stallion-ai/contracts/tool';
import { BedrockEmbeddingProvider } from './bedrock-embedding-provider.js';
import { BedrockLLMProvider } from './bedrock-llm-provider.js';
import { LanceDBProvider } from './lancedb-provider.js';
import type {
  IEmbeddingProvider,
  ILLMProvider,
  IVectorDbProvider,
} from './model-provider-types.js';
import {
  OllamaEmbeddingProvider,
  OllamaLLMProvider,
} from './ollama-provider.js';
import {
  OpenAICompatEmbeddingProvider,
  OpenAICompatLLMProvider,
} from './openai-compat-provider.js';

interface OllamaConfig {
  baseUrl?: string;
}

interface OpenAICompatConfig {
  baseUrl: string;
  apiKey?: string;
}

interface BedrockProviderConfig {
  region?: string;
}

interface LanceDBConfig {
  dataDir?: string;
}

interface BedrockEmbeddingConfig {
  region?: string;
  embeddingModel?: string;
}

export interface ProviderConnectionFactories {
  createLLM?: (
    connection: ProviderConnectionConfig,
  ) => ILLMProvider | null | undefined;
  createEmbedding?: (
    connection: ProviderConnectionConfig,
  ) => IEmbeddingProvider | null | undefined;
  createVectorDb?: (
    connection: ProviderConnectionConfig,
  ) => IVectorDbProvider | null | undefined;
}

const connectionFactoryRegistry = new Map<
  string,
  ProviderConnectionFactories
>();

export function registerConnectionFactory(
  type: string,
  factories: ProviderConnectionFactories,
): void {
  const existing = connectionFactoryRegistry.get(type) ?? {};
  connectionFactoryRegistry.set(type, {
    ...existing,
    ...factories,
  });
}

export function getConnectionFactory(
  type: string,
): ProviderConnectionFactories | undefined {
  return connectionFactoryRegistry.get(type);
}

export function createLLMProvider(
  conn: ProviderConnectionConfig,
): ILLMProvider | null {
  return getConnectionFactory(conn.type)?.createLLM?.(conn) ?? null;
}

export function createVectorDbProvider(
  conn: ProviderConnectionConfig,
): IVectorDbProvider | null {
  return getConnectionFactory(conn.type)?.createVectorDb?.(conn) ?? null;
}

export function createEmbeddingProvider(
  conn: ProviderConnectionConfig,
): IEmbeddingProvider | null {
  return getConnectionFactory(conn.type)?.createEmbedding?.(conn) ?? null;
}

registerConnectionFactory('ollama', {
  createLLM: (conn) => new OllamaLLMProvider(conn.config as OllamaConfig),
  createEmbedding: (conn) =>
    new OllamaEmbeddingProvider(conn.config as OllamaConfig),
});

registerConnectionFactory('openai-compat', {
  createLLM: (conn) =>
    new OpenAICompatLLMProvider(conn.config as unknown as OpenAICompatConfig),
  createEmbedding: (conn) =>
    new OpenAICompatEmbeddingProvider(
      conn.config as unknown as OpenAICompatConfig,
    ),
});

registerConnectionFactory('bedrock', {
  createLLM: (conn) =>
    new BedrockLLMProvider(conn.config as unknown as BedrockProviderConfig),
  createEmbedding: (conn) =>
    new BedrockEmbeddingProvider(
      conn.config as unknown as BedrockEmbeddingConfig,
    ),
});

registerConnectionFactory('lancedb', {
  createVectorDb: (conn) => new LanceDBProvider(conn.config as LanceDBConfig),
});
