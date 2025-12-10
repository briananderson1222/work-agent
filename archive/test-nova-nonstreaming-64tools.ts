#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

function generateTools(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    toolSpec: {
      name: `tool_${i}`,
      description: `Test tool number ${i}`,
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Test input' }
          },
          required: ['input']
        }
      }
    }
  }));
}

async function testNonStreaming() {
  console.log('🧪 Testing Nova NON-STREAMING with 64 tools\n');
  
  const tools = generateTools(64);
  
  try {
    const command = new ConverseCommand({
      modelId: 'us.amazon.nova-pro-v1:0',
      messages: [{ role: 'user', content: [{ text: 'Use tool_0 to process "test"' }] }],
      toolConfig: { tools }
    });

    const response = await client.send(command);
    
    console.log('✅ SUCCESS: Non-streaming with 64 tools works');
    console.log('Response:', JSON.stringify(response.output, null, 2));
    
    if (response.output?.message?.content?.some(c => c.toolUse)) {
      console.log('✅ Tool invocation successful');
    }
  } catch (error: any) {
    console.log('❌ FAILED:', error.message);
  }
}

testNonStreaming().catch(console.error);
