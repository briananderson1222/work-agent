#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

async function test(desc: string, toolName: string) {
  console.log(`\n🧪 ${desc}`);
  console.log(`   Tool: "${toolName}"`);
  
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
        console.log(`   ✅ SUCCESS - Tool invoked`);
        return true;
      }
    }
    console.log(`   ✅ SUCCESS (no invocation)`);
    return true;
  } catch (error: any) {
    console.log(`   ❌ CRASH`);
    return false;
  }
}

async function run() {
  console.log('🔍 Testing standardized server/tool naming format\n');
  console.log('Format: <server_name>/<tool_name> (hyphens → underscores)\n');
  
  // Original broken format
  await test('Original (broken)', 'sat-outlook_calendar_view');
  await new Promise(r => setTimeout(r, 1000));
  
  // Proposed standard: server/tool with underscores
  await test('Standard format', 'sat_outlook/calendar_view');
  await new Promise(r => setTimeout(r, 1000));
  
  // Alternative: server_tool (flat)
  await test('Flat format', 'sat_outlook_calendar_view');
  await new Promise(r => setTimeout(r, 1000));
  
  // Test with actual server names
  await test('Outlook server format', 'sat_outlook/email_search');
  await new Promise(r => setTimeout(r, 1000));
  
  await test('SFDC server format', 'sat_sfdc/query');
  await new Promise(r => setTimeout(r, 1000));
  
  // Edge case: slash only
  await test('Just slash separator', 'outlook/calendar');
  await new Promise(r => setTimeout(r, 1000));
  
  // Edge case: multiple slashes
  await test('Multiple slashes', 'sat/outlook/calendar/view');
}

run().catch(console.error);
