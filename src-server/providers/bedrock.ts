/**
 * Bedrock provider setup for VoltAgent using Vercel AI SDK
 */

import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { AppConfig, AgentSpec } from '../domain/types.js';

export interface BedrockProviderOptions {
  appConfig: AppConfig;
  agentSpec?: AgentSpec;
}

/**
 * Create Bedrock provider instance with config
 */
export function createBedrockProvider(options: BedrockProviderOptions) {
  const { appConfig, agentSpec } = options;

  // Use agent's model override or fall back to app default
  const model = agentSpec?.model || appConfig.defaultModel;
  const region = agentSpec?.region || appConfig.region;

  const provider = createAmazonBedrock({
    region,
    credentialProvider: fromNodeProviderChain(),
  });

  return provider.languageModel(model);
}

/**
 * Check if AWS credentials are configured
 */
export async function checkBedrockCredentials(): Promise<boolean> {
  try {
    const provider = fromNodeProviderChain();
    await provider();
    return true;
  } catch (error) {
    console.error('Bedrock credentials check failed:', error);
    return false;
  }
}

/**
 * Get available Bedrock models for a region
 */
export function getAvailableModels(region: string): string[] {
  // Common Bedrock model IDs (as of 2025)
  return [
    'anthropic.claude-3-5-sonnet-20240620-v1:0',
    'anthropic.claude-3-sonnet-20240229-v1:0',
    'anthropic.claude-3-haiku-20240307-v1:0',
    'anthropic.claude-3-opus-20240229-v1:0',
    'anthropic.claude-v2:1',
    'anthropic.claude-v2',
    'anthropic.claude-instant-v1',
  ];
}
