#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

async function testName(name: string, toolName: string) {
  console.log(`\n🧪 ${name}: "${toolName}"`);
  
  const tools = [{
    toolSpec: {
      name: toolName,
      description: 'Test',
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
  await testName('No underscore', 'satoutlookcalendarview');
  await new Promise(r => setTimeout(r, 1000));
  
  await testName('One underscore', 'sat_outlook');
  await new Promise(r => setTimeout(r, 1000));
  
  await testName('Two underscores', 'sat_outlook_calendar');
  await new Promise(r => setTimeout(r, 1000));
  
  await testName('Three underscores', 'sat_outlook_calendar_view');
}

run().catch(console.error);
