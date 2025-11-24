#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

interface TestCase {
  name: string;
  toolName: string;
  description: string;
  schema: any;
  prompt: string;
  streaming: boolean;
}

async function runTest(test: TestCase): Promise<boolean> {
  try {
    const tools = [{
      toolSpec: {
        name: test.toolName,
        description: test.description,
        inputSchema: { json: test.schema }
      }
    }];
    
    if (test.streaming) {
      const command = new ConverseStreamCommand({
        modelId: 'us.amazon.nova-pro-v1:0',
        messages: [{ role: 'user', content: [{ text: test.prompt }] }],
        toolConfig: { tools }
      });
      
      const response = await client.send(command);
      for await (const chunk of response.stream!) {
        if (chunk.contentBlockStart?.start?.toolUse) {
          return true;
        }
      }
      return true;
    } else {
      const command = new ConverseCommand({
        modelId: 'us.amazon.nova-pro-v1:0',
        messages: [{ role: 'user', content: [{ text: test.prompt }] }],
        toolConfig: { tools }
      });
      
      await client.send(command);
      return true;
    }
  } catch (error: any) {
    if (error.message?.includes('NGHTTP2_INTERNAL_ERROR')) {
      return false;
    }
    throw error;
  }
}

async function runMatrix() {
  console.log('🔍 Comprehensive Test Matrix\n');
  console.log('Testing combinations of:');
  console.log('  - Tool name (with/without hyphen)');
  console.log('  - Schema complexity (simple/complex)');
  console.log('  - Prompt type (generic/calendar-specific)');
  console.log('  - Streaming mode (on/off)\n');
  
  const simpleSchema = {
    type: 'object',
    properties: {
      input: { type: 'string' }
    }
  };
  
  const complexSchema = {
    type: 'object',
    properties: {
      view: { type: 'string', enum: ['day', 'week', 'month'], description: 'Calendar view type' },
      start_date: { type: 'string', description: 'The starting date to view (MM-DD-YYYY)' },
      end_date: { type: 'string', description: 'The ending date to view (MM-DD-YYYY)' }
    },
    required: ['start_date'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#'
  };
  
  const tests: TestCase[] = [
    // Baseline: everything simple
    {
      name: '1. Baseline (simple everything)',
      toolName: 'test_tool',
      description: 'Test',
      schema: simpleSchema,
      prompt: 'Use test_tool',
      streaming: true
    },
    
    // Add hyphen
    {
      name: '2. Add hyphen to name',
      toolName: 'test-tool',
      description: 'Test',
      schema: simpleSchema,
      prompt: 'Use test-tool',
      streaming: true
    },
    
    // Production name
    {
      name: '3. Production name (with hyphen)',
      toolName: 'sat-outlook_calendar_view',
      description: 'Test',
      schema: simpleSchema,
      prompt: 'Use sat-outlook_calendar_view',
      streaming: true
    },
    
    // Add complex schema
    {
      name: '4. Production name + complex schema',
      toolName: 'sat-outlook_calendar_view',
      description: 'Test',
      schema: complexSchema,
      prompt: 'Use sat-outlook_calendar_view',
      streaming: true
    },
    
    // Add production description
    {
      name: '5. Production name + schema + description',
      toolName: 'sat-outlook_calendar_view',
      description: 'Display daily, weekly, or monthly calendar views with scheduled events',
      schema: complexSchema,
      prompt: 'Use sat-outlook_calendar_view',
      streaming: true
    },
    
    // Change to calendar prompt
    {
      name: '6. Full production + calendar prompt',
      toolName: 'sat-outlook_calendar_view',
      description: 'Display daily, weekly, or monthly calendar views with scheduled events',
      schema: complexSchema,
      prompt: 'What is on my calendar for today?',
      streaming: true
    },
    
    // Test non-streaming with same config
    {
      name: '7. Same as #6 but NON-STREAMING',
      toolName: 'sat-outlook_calendar_view',
      description: 'Display daily, weekly, or monthly calendar views with scheduled events',
      schema: complexSchema,
      prompt: 'What is on my calendar for today?',
      streaming: false
    },
    
    // Test without hyphen but everything else same
    {
      name: '8. Same as #6 but NO HYPHEN',
      toolName: 'satoutlook_calendar_view',
      description: 'Display daily, weekly, or monthly calendar views with scheduled events',
      schema: complexSchema,
      prompt: 'What is on my calendar for today?',
      streaming: true
    },
    
    // Test with different hyphen position
    {
      name: '9. Hyphen in different position',
      toolName: 'sat_outlook-calendar_view',
      description: 'Display daily, weekly, or monthly calendar views with scheduled events',
      schema: complexSchema,
      prompt: 'What is on my calendar for today?',
      streaming: true
    },
    
    // Test simple schema with hyphen + calendar prompt
    {
      name: '10. Hyphen + calendar prompt + SIMPLE schema',
      toolName: 'sat-outlook_calendar_view',
      description: 'Display daily, weekly, or monthly calendar views with scheduled events',
      schema: simpleSchema,
      prompt: 'What is on my calendar for today?',
      streaming: true
    }
  ];
  
  const results: Array<{ test: string; result: string }> = [];
  
  for (const test of tests) {
    process.stdout.write(`\n🧪 ${test.name}... `);
    
    try {
      const success = await runTest(test);
      const result = success ? '✅ PASS' : '❌ CRASH';
      console.log(result);
      results.push({ test: test.name, result });
    } catch (error: any) {
      console.log(`❌ ERROR: ${error.message}`);
      results.push({ test: test.name, result: `ERROR: ${error.message}` });
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('\n\n📊 Summary:\n');
  results.forEach(r => {
    console.log(`${r.result.includes('PASS') ? '✅' : '❌'} ${r.test}`);
  });
  
  console.log('\n\n🔍 Analysis:');
  const crashes = results.filter(r => r.result.includes('CRASH'));
  if (crashes.length > 0) {
    console.log(`Found ${crashes.length} crashes. Looking for pattern...`);
    console.log('\nCrashed tests:');
    crashes.forEach(c => console.log(`  - ${c.test}`));
  } else {
    console.log('No crashes detected!');
  }
}

runMatrix().catch(console.error);
