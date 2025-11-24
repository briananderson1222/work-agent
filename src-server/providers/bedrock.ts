/**
 * Bedrock provider setup for VoltAgent using Vercel AI SDK
 */

import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { AppConfig, AgentSpec } from '../domain/types.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

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
    // Add custom fetch to log requests/responses
    fetch: async (url, init) => {
      const requestBody = init?.body ? JSON.parse(init.body as string) : null;
      const timestamp = Date.now();
      
      console.log('[BEDROCK REQUEST]', {
        url,
        method: init?.method,
        toolConfig: requestBody?.toolConfig,
        inferenceConfig: requestBody?.inferenceConfig,
        messageCount: requestBody?.messages?.length
      });
      
      // Save request to file
      writeFileSync(
        join(process.cwd(), `.bedrock-debug-${timestamp}-request.json`),
        JSON.stringify(requestBody, null, 2)
      );
      
      try {
        const response = await fetch(url, init);
        const clonedResponse = response.clone();
        
        // Capture raw stream to file
        const streamCapture: any[] = [];
        let captureError: any = null;
        
        try {
          const reader = clonedResponse.body?.getReader();
          if (reader) {
            let chunks = 0;
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                console.log('[BEDROCK RESPONSE] Stream ended normally after', chunks, 'chunks');
                streamCapture.push({ event: 'stream_end', chunks });
                break;
              }
              
              const decoded = value ? new TextDecoder().decode(value) : null;
              streamCapture.push({
                chunkNumber: chunks,
                size: value?.length,
                raw: decoded,
                preview: decoded?.slice(0, 300)
              });
              
              chunks++;
            }
            reader.releaseLock();
          }
        } catch (readError: any) {
          captureError = {
            message: readError.message,
            stack: readError.stack,
            name: readError.name
          };
          console.log('[BEDROCK RESPONSE] Read error:', readError);
          streamCapture.push({ event: 'read_error', error: captureError });
        }
        
        // Save stream capture to file
        writeFileSync(
          join(process.cwd(), `.bedrock-debug-${timestamp}-response.json`),
          JSON.stringify({ streamCapture, captureError }, null, 2)
        );
        
        return response;
      } catch (fetchError) {
        console.error('[BEDROCK FETCH ERROR]', fetchError);
        throw fetchError;
      }
    }
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
