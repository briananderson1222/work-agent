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
        console.log(`   ✅ SUCCESS`);
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
  console.log('🔍 Testing camelCase with underscore separator\n');
  console.log('Format: <serverName>_<toolName>\n');
  
  await test('satOutlook_calendarView', 'satOutlook_calendarView');
  await new Promise(r => setTimeout(r, 1000));
  
  await test('satOutlook_emailSearch', 'satOutlook_emailSearch');
  await new Promise(r => setTimeout(r, 1000));
  
  await test('satSfdc_query', 'satSfdc_query');
  await new Promise(r => setTimeout(r, 1000));
  
  await test('satSfdc_getAccount', 'satSfdc_getAccount');
  await new Promise(r => setTimeout(r, 1000));
  
  await test('awsKnowledge_searchDocs', 'awsKnowledge_searchDocs');
}

run().catch(console.error);
