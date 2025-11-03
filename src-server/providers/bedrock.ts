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
 * @deprecated Use BedrockModelCatalog.listModels() instead
 */
export function getAvailableModels(region: string): string[] {
  // This function is deprecated - use the model catalog API
  console.warn('getAvailableModels is deprecated. Use BedrockModelCatalog.listModels() instead.');
  return [];
}
