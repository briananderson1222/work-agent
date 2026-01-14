#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

async function testName(desc: string, toolName: string) {
  console.log(`\n🧪 ${desc}`);
  console.log(`   Name: "${toolName}" (${toolName.length} chars)`);
  
  const tools = [{
    toolSpec: {
      name: toolName,
      description: 'Display calendar views',
      inputSchema: {
        json: {
          type: 'object',
          properties: { start_date: { type: 'string' } },
          required: ['start_date']
        }
      }
    }
  }];
  
  try {
    const command = new ConverseStreamCommand({
      modelId: 'us.amazon.nova-pro-v1:0',
      messages: [{ role: 'user', content: [{ text: 'What is on my calendar for today?' }] }],
      toolConfig: { tools }
    });

    const response = await client.send(command);
    for await (const chunk of response.stream!) {
      if (chunk.contentBlockStart?.start?.toolUse) {
        console.log(`   ✅ SUCCESS`);
        return true;
      }
    }
    console.log(`   ✅ SUCCESS (no tool use)`);
    return true;
  } catch (error: any) {
    console.log(`   ❌ CRASH`);
    return false;
  }
}

async function run() {
  console.log('🔍 Testing hyphen and name length\n');
  
  // Test hyphens
  await testName('No hyphen', 'satoutlook_calendar_view');
  await new Promise(r => setTimeout(r, 1000));
  
  await testName('One hyphen', 'sat-outlook_calendar_view');
  await new Promise(r => setTimeout(r, 1000));
  
  await testName('Hyphen different position', 'sat_outlook-calendar_view');
  await new Promise(r => setTimeout(r, 1000));
  
  // Test length (sat-outlook_calendar_view = 26 chars)
  await testName('Short name (10 chars)', 'short_name');
  await new Promise(r => setTimeout(r, 1000));
  
  await testName('Medium name (20 chars)', 'medium_length_name12');
  await new Promise(r => setTimeout(r, 1000));
  
  await testName('Long name (26 chars)', 'very_long_tool_name_here12');
  await new Promise(r => setTimeout(r, 1000));
  
  await testName('Same length, no hyphen (26)', 'sat_outlook_calendar_view1');
}

run().catch(console.error);
