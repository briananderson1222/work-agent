#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

async function testSchema(name: string, schema: any) {
  console.log(`\n🧪 ${name}`);
  
  const tools = [{
    toolSpec: {
      name: 'sat-outlook_calendar_view',
      description: 'Display daily, weekly, or monthly calendar views with scheduled events',
      inputSchema: { json: schema }
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
    
    for await (const chunk of response.stream!) {
      chunks++;
      if (chunk.contentBlockStart?.start?.toolUse) {
        console.log(`   ✅ SUCCESS (tool invoked at chunk ${chunks})`);
        return true;
      }
    }
    
    console.log(`   ✅ SUCCESS (${chunks} chunks, no tool invocation)`);
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
  console.log('🔍 Isolating problematic field in production schema\n');
  
  // Test 1: Just start_date (minimal)
  await testSchema('1. Minimal (just start_date)', {
    type: 'object',
    properties: {
      start_date: { type: 'string', description: 'The starting date to view (MM-DD-YYYY)' }
    },
    required: ['start_date']
  });
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 2: Add view field
  await testSchema('2. Add view field', {
    type: 'object',
    properties: {
      view: { type: 'string', description: 'Calendar view type' },
      start_date: { type: 'string', description: 'The starting date to view (MM-DD-YYYY)' }
    },
    required: ['start_date']
  });
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 3: Add enum to view
  await testSchema('3. Add enum to view', {
    type: 'object',
    properties: {
      view: { type: 'string', enum: ['day', 'week', 'month'], description: 'Calendar view type' },
      start_date: { type: 'string', description: 'The starting date to view (MM-DD-YYYY)' }
    },
    required: ['start_date']
  });
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 4: Add end_date
  await testSchema('4. Add end_date', {
    type: 'object',
    properties: {
      view: { type: 'string', enum: ['day', 'week', 'month'], description: 'Calendar view type' },
      start_date: { type: 'string', description: 'The starting date to view (MM-DD-YYYY)' },
      end_date: { type: 'string', description: 'The ending date to view (MM-DD-YYYY)' }
    },
    required: ['start_date']
  });
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 5: Full production schema
  await testSchema('5. Full production schema', {
    type: 'object',
    properties: {
      view: { type: 'string', enum: ['day', 'week', 'month'], description: 'Calendar view type' },
      start_date: { type: 'string', description: 'The starting date to view (MM-DD-YYYY)' },
      end_date: { type: 'string', description: 'The ending date to view (MM-DD-YYYY)' }
    },
    required: ['start_date'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#'
  });
}

runTests().catch(console.error);
