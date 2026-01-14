#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

async function test(prompt: string) {
  console.log(`\n🧪 Prompt: "${prompt}"`);
  
  const tools = [{
    toolSpec: {
      name: 'sat-outlook_calendar_view',
      description: 'Display daily, weekly, or monthly calendar views',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            start_date: { type: 'string' }
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

(async () => {
  await test('Use sat-outlook_calendar_view');
  await new Promise(r => setTimeout(r, 1000));
  await test('What is on my calendar?');
  await new Promise(r => setTimeout(r, 1000));
  await test('What is on my calendar for today?');
})();
