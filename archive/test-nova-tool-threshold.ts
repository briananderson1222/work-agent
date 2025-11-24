#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

// Generate N simple tools
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

async function testToolCount(count: number): Promise<boolean> {
  console.log(`\n🧪 Testing with ${count} tools...`);
  
  const tools = generateTools(count);
  
  try {
    const command = new ConverseStreamCommand({
      modelId: 'us.amazon.nova-pro-v1:0',
      messages: [{ role: 'user', content: [{ text: 'Use tool_0 to process "test"' }] }],
      toolConfig: { tools }
    });

    const response = await client.send(command);
    let chunks = 0;
    
    for await (const chunk of response.stream!) {
      chunks++;
      if (chunk.contentBlockStart?.start?.toolUse) {
        console.log(`✅ SUCCESS: ${count} tools, ${chunks} chunks, tool invocation started`);
        return true;
      }
    }
    
    console.log(`✅ SUCCESS: ${count} tools, ${chunks} chunks (no tool invocation)`);
    return true;
  } catch (error: any) {
    if (error.message?.includes('NGHTTP2_INTERNAL_ERROR')) {
      console.log(`❌ CRASH: ${count} tools - NGHTTP2_INTERNAL_ERROR`);
      return false;
    }
    console.log(`❌ ERROR: ${count} tools - ${error.message}`);
    return false;
  }
}

async function binarySearch() {
  console.log('🔍 Finding exact tool count threshold for Nova streaming crash\n');
  
  // Test known boundaries
  const tests = [1, 5, 10, 20, 30, 40, 50, 60, 64];
  
  for (const count of tests) {
    const success = await testToolCount(count);
    if (!success) {
      console.log(`\n🎯 Found breaking point: Between ${tests[tests.indexOf(count) - 1]} and ${count} tools`);
      
      // Narrow down
      const prev = tests[tests.indexOf(count) - 1];
      for (let i = prev + 1; i < count; i++) {
        const result = await testToolCount(i);
        if (!result) {
          console.log(`\n🎯 EXACT THRESHOLD: ${i} tools causes crash, ${i - 1} tools works`);
          return;
        }
      }
    }
    
    // Wait between tests
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('\n✅ All tests passed - no crash detected up to 64 tools');
}

binarySearch().catch(console.error);
