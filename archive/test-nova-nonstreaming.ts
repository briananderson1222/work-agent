/**
 * Test Nova with tools using NON-STREAMING API
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

async function testNovaNonStreaming() {
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

  const command = new ConverseCommand({
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

  console.log('[NON-STREAMING TEST] Starting Nova with 1 tool (non-streaming)...');
  
  try {
    const response = await client.send(command);
    
    console.log('[NON-STREAMING TEST] Response received!');
    console.log(JSON.stringify(response, null, 2));
    
    if (response.output?.message?.content) {
      console.log('\n[NON-STREAMING TEST] Content blocks:', response.output.message.content.length);
      response.output.message.content.forEach((block, i) => {
        if (block.text) {
          console.log(`  Block ${i} (text):`, block.text.substring(0, 100));
        }
        if (block.toolUse) {
          console.log(`  Block ${i} (toolUse):`, block.toolUse);
        }
      });
    }
    
    console.log('\n[NON-STREAMING TEST] ✅ SUCCESS - Nova + tools works in non-streaming mode!');
    
  } catch (error: any) {
    console.error('[NON-STREAMING TEST] ❌ FAILED:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
  }
}

testNovaNonStreaming();
