#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

async function test(toolName: string, prompt: string) {
  console.log(`\n🧪 Tool: "${toolName}"`);
  console.log(`   Prompt: "${prompt}"`);
  
  const tools = [{
    toolSpec: {
      name: toolName,
      description: 'Display daily, weekly, or monthly calendar views with scheduled events',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            view: { type: 'string', enum: ['day', 'week', 'month'] },
            start_date: { type: 'string', description: 'The starting date to view (MM-DD-YYYY)' }
          },
          required: ['start_date']
        }
      }
    }
  }];
  
  try {
    const command = new ConverseStreamCommand({
      modelId: 'us.amazon.nova-pro-v1:0',
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      toolConfig: { tools }
    });

    const response = await client.send(command);
    for await (const chunk of response.stream!) {
      if (chunk.contentBlockStart?.start?.toolUse) {
        console.log(`   ✅ SUCCESS`);
        return;
      }
    }
    console.log(`   ✅ SUCCESS (no tool use)`);
  } catch (error: any) {
    console.log(`   ❌ CRASH`);
  }
}

async function run() {
  console.log('🔍 Testing hyphen + calendar prompt combination\n');
  
  // With hyphen
  await test('sat-outlook_calendar_view', 'What is on my calendar for today?');
  await new Promise(r => setTimeout(r, 1000));
  
  // Without hyphen
  await test('satoutlook_calendar_view', 'What is on my calendar for today?');
  await new Promise(r => setTimeout(r, 1000));
  
  // With hyphen, different prompt
  await test('sat-outlook_calendar_view', 'Use the tool');
  await new Promise(r => setTimeout(r, 1000));
  
  // With hyphen, generic prompt
  await test('my-calendar-tool', 'What is on my calendar for today?');
}

run().catch(console.error);
