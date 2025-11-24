#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

// Exact production schema from debug file
const productionSchema = {
  type: 'object',
  properties: {
    view: {
      type: 'string',
      enum: ['day', 'week', 'month'],
      description: 'Calendar view type'
    },
    start_date: {
      type: 'string',
      description: 'The starting date to view (MM-DD-YYYY)'
    },
    end_date: {
      type: 'string',
      description: 'The ending date to view (MM-DD-YYYY)'
    }
  },
  required: ['start_date'],
  additionalProperties: false,
  $schema: 'http://json-schema.org/draft-07/schema#'
};

async function testExactSchema() {
  console.log('🧪 Testing with EXACT production schema\n');
  
  const tools = [{
    toolSpec: {
      name: 'sat-outlook_calendar_view',
      description: 'Display daily, weekly, or monthly calendar views with scheduled events',
      inputSchema: { json: productionSchema }
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
        const t = chunk.contentBlockDelta.delta.text;
        text += t;
        process.stdout.write(t);
      }
      
      if (chunk.contentBlockStart?.start?.toolUse) {
        console.log(`\n\n✅ Tool invocation at chunk ${chunks}`);
        return;
      }
    }
    
    console.log(`\n\n✅ SUCCESS: ${chunks} chunks, ${text.length} chars`);
  } catch (error: any) {
    if (error.message?.includes('NGHTTP2_INTERNAL_ERROR')) {
      console.log('\n\n❌ CRASH: NGHTTP2_INTERNAL_ERROR');
      console.log('Reproduced the production crash!');
    } else {
      console.log('\n\n❌ ERROR:', error.message);
    }
  }
}

testExactSchema().catch(console.error);
