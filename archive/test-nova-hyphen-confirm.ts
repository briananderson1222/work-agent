#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

async function testName(desc: string, toolName: string) {
  console.log(`\n🧪 ${desc}: "${toolName}"`);
  
  const tools = [{
    toolSpec: {
      name: toolName,
      description: 'Test tool',
      inputSchema: {
        json: {
          type: 'object',
          properties: { input: { type: 'string' } }
        }
      }
    }
  }];
  
  try {
    const command = new ConverseStreamCommand({
      modelId: 'us.amazon.nova-pro-v1:0',
      messages: [{ role: 'user', content: [{ text: `Use ${toolName}` }] }],
      toolConfig: { tools }
    });

    const response = await client.send(command);
    for await (const chunk of response.stream!) {
      if (chunk.contentBlockStart?.start?.toolUse) {
        console.log(`   ✅ SUCCESS`);
        return true;
      }
    }
    console.log(`   ✅ SUCCESS`);
    return true;
  } catch (error: any) {
    console.log(`   ❌ CRASH`);
    return false;
  }
}

async function run() {
  console.log('🔍 Confirming hyphen is the root cause\n');
  
  await testName('Simple hyphen', 'my-tool');
  await new Promise(r => setTimeout(r, 1000));
  
  await testName('Multiple hyphens', 'my-test-tool');
  await new Promise(r => setTimeout(r, 1000));
  
  await testName('Hyphen at start', '-mytool');
  await new Promise(r => setTimeout(r, 1000));
  
  await testName('Hyphen at end', 'mytool-');
  await new Promise(r => setTimeout(r, 1000));
  
  await testName('No hyphen (control)', 'my_tool');
}

run().catch(console.error);
