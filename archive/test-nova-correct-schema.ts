/**
 * Test Nova with CORRECT tool schema format from AWS docs
 */

import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

async function testNovaCorrectSchema() {
  const client = new BedrockRuntimeClient({
    region: 'us-east-1',
    credentials: fromNodeProviderChain(),
  });

  // Correct format from AWS docs
  const toolConfig = {
    tools: [{
      toolSpec: {
        name: 'get_weather',
        description: 'Get the current weather for a location',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city and state, e.g. San Francisco, CA'
              }
            },
            required: ['location']
          }
        }
      }
    }]
  };

  console.log('[CORRECT SCHEMA] Testing non-streaming first...\n');
  
  try {
    const command = new ConverseCommand({
      modelId: 'us.amazon.nova-pro-v1:0',
      messages: [{
        role: 'user',
        content: [{ text: 'What is the weather in Seattle?' }]
      }],
      toolConfig,
      inferenceConfig: {
        maxTokens: 4096,
        temperature: 0.7
      }
    });

    const response = await client.send(command);
    console.log('[NON-STREAMING] ✅ SUCCESS!');
    console.log('Stop reason:', response.stopReason);
    
    if (response.output?.message?.content) {
      response.output.message.content.forEach((block, i) => {
        if (block.text) {
          console.log(`  Block ${i} (text):`, block.text.substring(0, 100));
        }
        if (block.toolUse) {
          console.log(`  Block ${i} (toolUse):`, JSON.stringify(block.toolUse, null, 2));
        }
      });
    }
    
  } catch (error: any) {
    console.error('[NON-STREAMING] ❌ FAILED:', error.message);
    return;
  }

  console.log('\n[CORRECT SCHEMA] Now testing streaming...\n');
  
  try {
    const streamCommand = new ConverseStreamCommand({
      modelId: 'us.amazon.nova-pro-v1:0',
      messages: [{
        role: 'user',
        content: [{ text: 'What is the weather in Seattle?' }]
      }],
      toolConfig,
      inferenceConfig: {
        maxTokens: 4096,
        temperature: 0.7
      }
    });

    const streamResponse = await client.send(streamCommand);
    
    if (!streamResponse.stream) {
      console.error('[STREAMING] No stream in response');
      return;
    }

    let chunkCount = 0;
    let sawToolUse = false;
    
    for await (const event of streamResponse.stream) {
      if (event.contentBlockStart?.start?.toolUse) {
        console.log(`[STREAMING CHUNK ${chunkCount}] ✅ Tool use started:`, event.contentBlockStart.start.toolUse);
        sawToolUse = true;
      }
      if (event.contentBlockDelta?.delta?.text) {
        console.log(`[STREAMING CHUNK ${chunkCount}] Text:`, event.contentBlockDelta.delta.text);
      }
      chunkCount++;
    }
    
    console.log(`\n[STREAMING] ✅ SUCCESS! Received ${chunkCount} chunks`);
    console.log(`[STREAMING] Saw tool use: ${sawToolUse}`);
    
  } catch (error: any) {
    console.error('[STREAMING] ❌ FAILED:', {
      message: error.message,
      name: error.name
    });
  }
}

testNovaCorrectSchema();
