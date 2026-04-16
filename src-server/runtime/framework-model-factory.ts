import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { AppConfig } from '@stallion-ai/contracts/config';
import type { ProviderConnectionConfig } from '@stallion-ai/contracts/tool';
import { BedrockModel } from '@strands-agents/sdk';
import { VercelModel } from '@strands-agents/sdk/models/vercel';
import { createBedrockProvider } from '../providers/bedrock.js';

interface FrameworkModelOptions {
  providerConnection: ProviderConnectionConfig | null;
  modelId: string;
  spec: Pick<AgentSpec, 'guardrails' | 'region'>;
  appConfig: Pick<AppConfig, 'defaultMaxOutputTokens' | 'region'>;
}

export function createVoltAgentManagedModel(
  options: FrameworkModelOptions,
): any {
  if (
    !options.providerConnection ||
    options.providerConnection.type === 'bedrock'
  ) {
    return createBedrockProvider({
      appConfig: {
        defaultModel: options.modelId,
        region: resolveBedrockRegion(options),
      } as AppConfig,
      agentSpec: {
        model: options.modelId,
        region: resolveBedrockRegion(options),
      } as AgentSpec,
    });
  }

  return createOpenAICompatibleLanguageModel(options);
}

export function createStrandsManagedModel(options: FrameworkModelOptions): any {
  if (
    !options.providerConnection ||
    options.providerConnection.type === 'bedrock'
  ) {
    return new BedrockModel({
      modelId: options.modelId,
      region: resolveBedrockRegion(options),
      maxTokens:
        options.spec.guardrails?.maxTokens ??
        options.appConfig.defaultMaxOutputTokens,
      temperature: options.spec.guardrails?.temperature,
      topP: options.spec.guardrails?.topP,
    });
  }

  return new VercelModel({
    provider: createOpenAICompatibleLanguageModel(options),
    maxTokens:
      options.spec.guardrails?.maxTokens ??
      options.appConfig.defaultMaxOutputTokens,
    temperature: options.spec.guardrails?.temperature,
    topP: options.spec.guardrails?.topP,
  });
}

function createOpenAICompatibleLanguageModel(options: FrameworkModelOptions) {
  if (
    options.providerConnection?.type !== 'openai-compat' &&
    options.providerConnection?.type !== 'ollama'
  ) {
    throw new Error(
      `Managed runtime provider '${options.providerConnection?.type ?? 'unknown'}' is not supported by the current framework bridge.`,
    );
  }
  const baseURL = resolveOpenAICompatibleBaseUrl(options.providerConnection);
  const apiKey = resolveApiKey(options.providerConnection);
  return createOpenAICompatible({
    name:
      options.providerConnection?.name ||
      options.providerConnection?.type ||
      'openai-compatible',
    baseURL,
    ...(apiKey ? { apiKey } : {}),
  }).chatModel(options.modelId);
}

function resolveBedrockRegion(options: FrameworkModelOptions): string {
  if (typeof options.spec.region === 'string' && options.spec.region.trim()) {
    return options.spec.region.trim();
  }
  const configuredRegion = options.providerConnection?.config.region;
  if (typeof configuredRegion === 'string' && configuredRegion.trim()) {
    return configuredRegion.trim();
  }
  return options.appConfig.region || 'us-east-1';
}

function resolveOpenAICompatibleBaseUrl(
  providerConnection: ProviderConnectionConfig | null,
): string {
  const configuredBaseUrl =
    typeof providerConnection?.config.baseUrl === 'string'
      ? providerConnection.config.baseUrl.trim()
      : '';

  if (!configuredBaseUrl) {
    return 'http://localhost:11434/v1';
  }

  if (providerConnection?.type === 'ollama') {
    return normalizeOllamaBaseUrl(configuredBaseUrl);
  }

  return configuredBaseUrl;
}

function normalizeOllamaBaseUrl(baseUrl: string): string {
  return /\/v1\/?$/.test(baseUrl)
    ? baseUrl
    : `${baseUrl.replace(/\/$/, '')}/v1`;
}

function resolveApiKey(
  providerConnection: ProviderConnectionConfig | null,
): string | undefined {
  const apiKey = providerConnection?.config.apiKey;
  return typeof apiKey === 'string' && apiKey.trim().length > 0
    ? apiKey.trim()
    : undefined;
}
