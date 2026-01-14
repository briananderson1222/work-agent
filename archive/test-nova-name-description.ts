#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

async function testTool(name: string, toolName: string, description: string) {
  console.log(`\n🧪 ${name}`);
  console.log(`   Tool: ${toolName}`);
  console.log(`   Desc: ${description}`);
  
  const tools = [{
    toolSpec: {
      name: toolName,
      description: description,
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          },
          required: ['input']
        }
      }
    }
  }];
  
  try {
    const command = new ConverseStreamCommand({
      modelId: 'us.amazon.nova-pro-v1:0',
      messages: [{ role: 'user', content: [{ text: `Use ${toolName} with input "test"` }] }],
      toolConfig: { tools }
    });

    const response = await client.send(command);
    let chunks = 0;
    
    for await (const chunk of response.stream!) {
      chunks++;
      if (chunk.contentBlockStart?.start?.toolUse) {
        console.log(`   ✅ SUCCESS (chunk ${chunks})`);
        return true;
      }
    }
    
    console.log(`   ✅ SUCCESS (${chunks} chunks)`);
    return true;
  } catch (error: any) {
    if (error.message?.includes('NGHTTP2_INTERNAL_ERROR')) {
      console.log(`   ❌ CRASH`);
      return false;
    }
    console.log(`   ❌ ERROR: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🔍 Testing tool name and description\n');
  
  // Test 1: Simple name
  await testTool('1. Simple name', 'test_tool', 'Test tool');
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 2: Production name
  await testTool('2. Production name', 'sat-outlook_calendar_view', 'Test tool');
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 3: Production description
  await testTool('3. Production description', 'test_tool', 'Display daily, weekly, or monthly calendar views with scheduled events');
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 4: Both production
  await testTool('4. Both production', 'sat-outlook_calendar_view', 'Display daily, weekly, or monthly calendar views with scheduled events');
}

runTests().catch(console.error);
