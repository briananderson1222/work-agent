/**
 * Test with Node.js socket-level debugging to see TCP connection state
 */

import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { NodeHttpHandler } from '@smithy/node-http-handler';
// Socket debugging via AWS SDK client config

async function testWithSocketDebug() {
  const client = new BedrockRuntimeClient({
    region: 'us-east-1',
    credentials: fromNodeProviderChain(),
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 30000,
      socketTimeout: 30000,
    }),
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

  console.log('[SOCKET DEBUG] Starting Nova stream...');
  console.log('[SOCKET DEBUG] Client config:', {
    connectionTimeout: 30000,
    socketTimeout: 30000
  });
  
  try {
    const response = await client.send(command);
    
    if (!response.stream) {
      console.error('[SOCKET DEBUG] No stream in response');
      return;
    }

    let chunkCount = 0;
    const startTime = Date.now();
    let lastChunkTime = startTime;
    
    for await (const event of response.stream) {
      const now = Date.now();
      const timeSinceStart = now - startTime;
      const timeSinceLastChunk = now - lastChunkTime;
      
      console.log(`[SOCKET DEBUG CHUNK ${chunkCount}] +${timeSinceLastChunk}ms (total: ${timeSinceStart}ms)`);
      
      if (event.contentBlockDelta?.delta?.text) {
        console.log('  Text:', event.contentBlockDelta.delta.text);
      }
      
      lastChunkTime = now;
      chunkCount++;
    }
    
    console.log('[SOCKET DEBUG] Stream completed');
    console.log('[SOCKET DEBUG] Total time:', Date.now() - startTime, 'ms');
    
  } catch (error: any) {
    console.error('[SOCKET DEBUG ERROR]', {
      message: error.message,
      name: error.name,
      cause: error.cause
    });
  }
}

testWithSocketDebug();
