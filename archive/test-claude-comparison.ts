/**
 * Test Claude with same tool config to compare stream behavior
 */

import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { writeFileSync } from 'fs';

async function testClaudeStreaming() {
  const client = new BedrockRuntimeClient({
    region: 'us-east-1',
    credentials: fromNodeProviderChain(),
  });

  const toolConfig = {
    tools: [{
      toolSpec: {
        name: 'sat-outlook_calendar_view',
        description: 'View calendar events',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              timeframe: { type: 'string' }
            }
          }
        }
      }
    }],
    toolChoice: { auto: {} }
  };

  const command = new ConverseStreamCommand({
    modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
    messages: [{
      role: 'user',
      content: [{ text: 'What is on my calendar for today?' }]
    }],
    toolConfig,
    inferenceConfig: {
      maxTokens: 4096,
      temperature: 0.7
    }
  });

  console.log('[CLAUDE TEST] Starting Claude stream with 1 tool...');
  
  const events: any[] = [];
  
  try {
    const response = await client.send(command);
    
    if (!response.stream) {
      console.error('[CLAUDE TEST] No stream in response');
      return;
    }

    let chunkCount = 0;
    let textAccumulated = '';
    
    for await (const event of response.stream) {
      events.push({ chunkNumber: chunkCount, event });
      
      console.log(`[CLAUDE TEST CHUNK ${chunkCount}]`, JSON.stringify(event, null, 2));
      
      if (event.contentBlockDelta?.delta?.text) {
        textAccumulated += event.contentBlockDelta.delta.text;
      }
      
      if (event.contentBlockStart?.start?.toolUse) {
        console.log('[CLAUDE TEST] Tool use started:', event.contentBlockStart.start.toolUse);
      }
      
      chunkCount++;
    }
    
    console.log('[CLAUDE TEST] Stream completed successfully');
    console.log('[CLAUDE TEST] Total chunks:', chunkCount);
    console.log('[CLAUDE TEST] Accumulated text:', textAccumulated);
    
    // Save to file for comparison
    writeFileSync('.claude-stream-capture.json', JSON.stringify(events, null, 2));
    console.log('[CLAUDE TEST] Stream saved to .claude-stream-capture.json');
    
  } catch (error: any) {
    console.error('[CLAUDE TEST ERROR]', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    writeFileSync('.claude-stream-error.json', JSON.stringify({ error, events }, null, 2));
  }
}

testClaudeStreaming();
