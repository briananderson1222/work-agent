#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

async function test(name: string, toolName: string) {
  console.log(`\n🧪 ${name}: "${toolName}"`);
  
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
      messages: [{ role: 'user', content: [{ text: 'What is on my calendar for today?' }] }],
      toolConfig: { tools }
    });

    const response = await client.send(command);
    let chunks = 0;
    let text = '';
    
    for await (const chunk of response.stream!) {
      chunks++;
      
      if (chunk.contentBlockDelta?.delta?.text) {
        text += chunk.contentBlockDelta.delta.text;
      }
      
      if (chunk.contentBlockStart?.start?.toolUse) {
        console.log(`   ✅ SUCCESS - Tool invoked at chunk ${chunks}`);
        console.log(`   Tool: ${chunk.contentBlockStart.start.toolUse.name}`);
        return true;
      }
    }
    
    console.log(`   ✅ SUCCESS - ${chunks} chunks, ${text.length} chars (no tool invocation)`);
    return true;
  } catch (error: any) {
    console.log(`   ❌ CRASH: ${error.message}`);
    return false;
  }
}

async function run() {
  console.log('🔍 Verification: Underscore fix works\n');
  
  console.log('=== BROKEN (with hyphen) ===');
  await test('Original broken name', 'sat-outlook_calendar_view');
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('\n=== FIXED (with underscore) ===');
  await test('Fixed name', 'sat_outlook_calendar_view');
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('\n=== ALSO FIXED (all underscores) ===');
  await test('Alternative fix', 'satoutlook_calendar_view');
}

run().catch(console.error);
