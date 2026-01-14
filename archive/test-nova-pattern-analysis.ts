#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

async function test(name: string, toolName: string, description: string, schema: any, prompt: string) {
  console.log(`\n🧪 ${name}`);
  console.log(`   Tool: "${toolName}"`);
  console.log(`   Desc: "${description}"`);
  console.log(`   Prompt: "${prompt}"`);
  
  const tools = [{
    toolSpec: {
      name: toolName,
      description: description,
      inputSchema: { json: schema }
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
        console.log(`   ✅ PASS`);
        return;
      }
    }
    console.log(`   ✅ PASS (no tool use)`);
  } catch (error: any) {
    console.log(`   ❌ CRASH`);
  }
}

async function run() {
  console.log('🔍 Pattern Analysis: Why do tests 3 and 5 pass?\n');
  
  const simpleSchema = {
    type: 'object',
    properties: { input: { type: 'string' } }
  };
  
  const complexSchema = {
    type: 'object',
    properties: {
      view: { type: 'string', enum: ['day', 'week', 'month'] },
      start_date: { type: 'string', description: 'The starting date to view (MM-DD-YYYY)' }
    },
    required: ['start_date'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#'
  };
  
  // Test 3 passed: hyphen + simple schema + short desc + direct prompt
  await test(
    'Test 3 (PASSED)',
    'sat-outlook_calendar_view',
    'Test',
    simpleSchema,
    'Use sat-outlook_calendar_view'
  );
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 2 crashed: hyphen + simple schema + short desc + direct prompt (different name)
  await test(
    'Test 2 (CRASHED) - only difference is tool name',
    'test-tool',
    'Test',
    simpleSchema,
    'Use test-tool'
  );
  await new Promise(r => setTimeout(r, 1000));
  
  // What if we use the exact test-tool name but with sat-outlook prompt?
  await test(
    'test-tool with sat-outlook prompt',
    'test-tool',
    'Test',
    simpleSchema,
    'Use sat-outlook_calendar_view'
  );
  await new Promise(r => setTimeout(r, 1000));
  
  // What if we use sat-outlook name but with test-tool prompt?
  await test(
    'sat-outlook name with test-tool prompt',
    'sat-outlook_calendar_view',
    'Test',
    simpleSchema,
    'Use test-tool'
  );
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 5 passed: hyphen + complex schema + long desc + direct prompt
  await test(
    'Test 5 (PASSED)',
    'sat-outlook_calendar_view',
    'Display daily, weekly, or monthly calendar views with scheduled events',
    complexSchema,
    'Use sat-outlook_calendar_view'
  );
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 4 crashed: same but short desc
  await test(
    'Test 4 (CRASHED) - only difference is description',
    'sat-outlook_calendar_view',
    'Test',
    complexSchema,
    'Use sat-outlook_calendar_view'
  );
}

run().catch(console.error);
