#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

async function testSchema(name: string, schema: any) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`Schema:`, JSON.stringify(schema, null, 2));
  
  const tools = [{
    toolSpec: {
      name: 'test_tool',
      description: 'Test tool',
      inputSchema: { json: schema }
    }
  }];
  
  try {
    const command = new ConverseStreamCommand({
      modelId: 'us.amazon.nova-pro-v1:0',
      messages: [{ role: 'user', content: [{ text: 'Use test_tool with input "hello"' }] }],
      toolConfig: { tools }
    });

    const response = await client.send(command);
    let chunks = 0;
    
    for await (const chunk of response.stream!) {
      chunks++;
      if (chunk.contentBlockStart?.start?.toolUse) {
        console.log(`✅ SUCCESS: Tool invocation at chunk ${chunks}`);
        return true;
      }
    }
    
    console.log(`✅ SUCCESS: ${chunks} chunks (no tool invocation)`);
    return true;
  } catch (error: any) {
    if (error.message?.includes('NGHTTP2_INTERNAL_ERROR')) {
      console.log(`❌ CRASH: NGHTTP2_INTERNAL_ERROR`);
      return false;
    }
    console.log(`❌ ERROR: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🔍 Testing schema field combinations\n');
  
  // Test 1: Clean schema (no extra fields)
  await testSchema('Clean schema', {
    type: 'object',
    properties: {
      input: { type: 'string' }
    },
    required: ['input']
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 2: With additionalProperties
  await testSchema('With additionalProperties: false', {
    type: 'object',
    properties: {
      input: { type: 'string' }
    },
    required: ['input'],
    additionalProperties: false
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 3: With $schema
  await testSchema('With $schema', {
    type: 'object',
    properties: {
      input: { type: 'string' }
    },
    required: ['input'],
    $schema: 'http://json-schema.org/draft-07/schema#'
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Test 4: With both (production schema)
  await testSchema('With both additionalProperties + $schema', {
    type: 'object',
    properties: {
      input: { type: 'string' }
    },
    required: ['input'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#'
  });
}

runTests().catch(console.error);
