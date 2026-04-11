/**
 * Bedrock provider setup for VoltAgent using Vercel AI SDK
 */

import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { AppConfig } from '@stallion-ai/contracts/config';

export interface BedrockProviderOptions {
  appConfig: AppConfig;
  agentSpec?: AgentSpec;
}

/**
 * Create Bedrock provider instance with config
 */
export function createBedrockProvider(options: BedrockProviderOptions) {
  const { appConfig, agentSpec } = options;

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
  } catch (e) {
    console.debug('Failed to check Bedrock credentials:', e);
    return false;
  }
}
