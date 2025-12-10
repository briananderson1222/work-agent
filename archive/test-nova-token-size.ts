#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

// Generate tools with varying complexity
function generateSimpleTools(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    toolSpec: {
      name: `simple_${i}`,
      description: `Tool ${i}`,
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            x: { type: 'string' }
          }
        }
      }
    }
  }));
}

function generateComplexTools(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    toolSpec: {
      name: `complex_${i}`,
      description: `This is a very detailed description for tool number ${i}. It includes extensive documentation about what the tool does, how to use it, what parameters it accepts, and what results it returns. This description is intentionally verbose to increase the token count of the tool schema definition.`,
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            param1: { type: 'string', description: 'First parameter with detailed description' },
            param2: { type: 'number', description: 'Second parameter with detailed description' },
            param3: { type: 'boolean', description: 'Third parameter with detailed description' },
            param4: { type: 'array', items: { type: 'string' }, description: 'Fourth parameter' },
            param5: { type: 'object', properties: { nested: { type: 'string' } } }
          },
          required: ['param1', 'param2']
        }
      }
    }
  }));
}

async function testScenario(name: string, tools: any[]) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`   Tools: ${tools.length}`);
  console.log(`   Approx tokens: ${JSON.stringify(tools).length / 4}`);
  
  try {
    const command = new ConverseStreamCommand({
      modelId: 'us.amazon.nova-pro-v1:0',
      messages: [{ role: 'user', content: [{ text: 'List available tools' }] }],
      toolConfig: { tools }
    });

    const response = await client.send(command);
    let chunks = 0;
    
    for await (const chunk of response.stream!) {
      chunks++;
    }
    
    console.log(`   ✅ SUCCESS: ${chunks} chunks`);
    return true;
  } catch (error: any) {
    if (error.message?.includes('NGHTTP2_INTERNAL_ERROR')) {
      console.log(`   ❌ CRASH: NGHTTP2_INTERNAL_ERROR`);
      return false;
    }
    console.log(`   ❌ ERROR: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🔍 Testing: Tool Count vs Token Size\n');
  
  // Test 1: Many simple tools (high count, low tokens)
  await testScenario('64 simple tools (low token count)', generateSimpleTools(64));
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 2: Few complex tools (low count, high tokens)
  await testScenario('10 complex tools (high token count)', generateComplexTools(10));
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 3: Many complex tools (high count, high tokens)
  await testScenario('30 complex tools (very high token count)', generateComplexTools(30));
}

runTests().catch(console.error);
