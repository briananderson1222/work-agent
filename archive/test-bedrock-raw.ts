/**
 * Test raw Bedrock converse-stream API to isolate issue
 * Bypasses VoltAgent and AI SDK to test AWS SDK directly
 */

import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

async function testNovaStreaming() {
  const client = new BedrockRuntimeClient({
    region: 'us-east-1',
    credentials: fromNodeProviderChain(),
  });

  const toolConfig = {
    tools: [{
      toolSpec: {
        name: 'sat-outlook_calendar_view',
        description: 'View calendar events',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              timeframe: { type: 'string' }
            }
          }
        }
      }
    }],
    toolChoice: { auto: {} }
  };

  const command = new ConverseStreamCommand({
    modelId: 'us.amazon.nova-pro-v1:0',
    messages: [{
      role: 'user',
      content: [{ text: 'What is on my calendar for today?' }]
    }],
    toolConfig,
    inferenceConfig: {
      maxTokens: 4096,
      temperature: 0.7
    }
  });

  console.log('[RAW TEST] Starting Nova stream with 1 tool...');
  
  try {
    const response = await client.send(command);
    
    if (!response.stream) {
      console.error('[RAW TEST] No stream in response');
      return;
    }

    let chunkCount = 0;
    let textAccumulated = '';
    
    for await (const event of response.stream) {
      console.log(`[RAW TEST CHUNK ${chunkCount}]`, JSON.stringify(event, null, 2));
      
      if (event.contentBlockDelta?.delta?.text) {
        textAccumulated += event.contentBlockDelta.delta.text;
      }
      
      if (event.contentBlockStart?.start?.toolUse) {
        console.log('[RAW TEST] Tool use started:', event.contentBlockStart.start.toolUse);
      }
      
      chunkCount++;
    }
    
    console.log('[RAW TEST] Stream completed successfully');
    console.log('[RAW TEST] Total chunks:', chunkCount);
    console.log('[RAW TEST] Accumulated text:', textAccumulated);
    
  } catch (error: any) {
    console.error('[RAW TEST ERROR]', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      cause: error.cause
    });
  }
}

testNovaStreaming();
