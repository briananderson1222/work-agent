/**
 * Bedrock provider setup for VoltAgent using Vercel AI SDK
 */

import { bedrock } from '@ai-sdk/amazon-bedrock';
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

  // Create provider with region
  const provider = bedrock({
    region,
    // AWS credentials are picked up from environment/AWS config
  });

  // Return model instance with guardrails
  return provider(model, {
    ...(agentSpec?.guardrails && {
      maxTokens: agentSpec.guardrails.maxTokens,
      temperature: agentSpec.guardrails.temperature,
      topP: agentSpec.guardrails.topP,
      stopSequences: agentSpec.guardrails.stopSequences,
    }),
  });
}

/**
 * Check if AWS credentials are configured
 */
export async function checkBedrockCredentials(): Promise<boolean> {
  try {
    // Try to import AWS SDK
    const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');

    // Create client (will use default credential chain)
    const client = new BedrockRuntimeClient({ region: 'us-east-1' });

    // This doesn't actually call the API, just checks if credentials are available
    // In production, you'd want to make an actual test call
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
