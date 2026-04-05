import type { ProviderConnectionConfig } from '@stallion-ai/shared';
import { BedrockEmbeddingProvider } from './bedrock-embedding-provider.js';
import { BedrockLLMProvider } from './bedrock-llm-provider.js';
import { LanceDBProvider } from './lancedb-provider.js';
import {
  OllamaEmbeddingProvider,
  OllamaLLMProvider,
} from './ollama-provider.js';
import {
  OpenAICompatEmbeddingProvider,
  OpenAICompatLLMProvider,
} from './openai-compat-provider.js';
import type {
  IEmbeddingProvider,
  ILLMProvider,
  IVectorDbProvider,
} from './types.js';

interface OllamaConfig {
  baseUrl?: string;
}

interface OpenAICompatConfig {
  baseUrl: string;
  apiKey?: string;
}

interface BedrockProviderConfig {
  region: string;
}

interface LanceDBConfig {
  dataDir?: string;
}

interface BedrockEmbeddingConfig {
  region?: string;
  embeddingModel?: string;
}

export function createLLMProvider(
  conn: ProviderConnectionConfig,
): ILLMProvider | null {
  if (conn.type === 'ollama') {
    return new OllamaLLMProvider(conn.config as OllamaConfig);
  }
  if (conn.type === 'openai-compat') {
    return new OpenAICompatLLMProvider(
      conn.config as unknown as OpenAICompatConfig,
    );
  }
  if (conn.type === 'bedrock') {
    return new BedrockLLMProvider(
      conn.config as unknown as BedrockProviderConfig,
    );
  }
  return null;
}

export function createVectorDbProvider(
  conn: ProviderConnectionConfig,
): IVectorDbProvider | null {
  if (conn.type === 'lancedb') {
    return new LanceDBProvider(conn.config as LanceDBConfig);
  }
  return null;
}

export function createEmbeddingProvider(
  conn: ProviderConnectionConfig,
): IEmbeddingProvider | null {
  if (conn.type === 'ollama') {
    return new OllamaEmbeddingProvider(conn.config as OllamaConfig);
  }
  if (conn.type === 'openai-compat') {
    return new OpenAICompatEmbeddingProvider(
      conn.config as unknown as OpenAICompatConfig,
    );
  }
  if (conn.type === 'bedrock') {
    return new BedrockEmbeddingProvider(conn.config as BedrockEmbeddingConfig);
  }
  return null;
}
