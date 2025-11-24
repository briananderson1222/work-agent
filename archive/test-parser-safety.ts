/**
 * Test with error boundary around stream parser to catch malformed chunks
 */

import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { writeFileSync } from 'fs';

async function testWithParserSafety() {
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
    modelId: 'us.amazon.nova-pro-v1:0',
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

  console.log('[PARSER SAFETY] Starting Nova stream with error boundaries...');
  
  const rawEvents: any[] = [];
  let lastSuccessfulChunk = -1;
  
  try {
    const response = await client.send(command);
    
    if (!response.stream) {
      console.error('[PARSER SAFETY] No stream in response');
      return;
    }

    let chunkCount = 0;
    
    for await (const event of response.stream) {
      try {
        // Capture raw event before any processing
        const eventCopy = JSON.parse(JSON.stringify(event));
        rawEvents.push({ chunkNumber: chunkCount, event: eventCopy, timestamp: Date.now() });
        
        // Try to access all possible fields safely
        const hasText = event.contentBlockDelta?.delta?.text;
        const hasToolUse = event.contentBlockStart?.start?.toolUse;
        const hasToolResult = event.contentBlockDelta?.delta?.toolUse;
        const messageStop = event.messageStop;
        
        console.log(`[PARSER SAFETY CHUNK ${chunkCount}]`, {
          hasText: !!hasText,
          hasToolUse: !!hasToolUse,
          hasToolResult: !!hasToolResult,
          messageStop: !!messageStop,
          text: hasText ? event.contentBlockDelta.delta.text : null
        });
        
        lastSuccessfulChunk = chunkCount;
        chunkCount++;
        
      } catch (parseError: any) {
        console.error(`[PARSER SAFETY] Error processing chunk ${chunkCount}:`, {
          error: parseError.message,
          stack: parseError.stack,
          rawEvent: event
        });
        rawEvents.push({ 
          chunkNumber: chunkCount, 
          parseError: { message: parseError.message, stack: parseError.stack },
          rawEvent: event 
        });
        break;
      }
    }
    
    console.log('[PARSER SAFETY] Stream completed');
    console.log('[PARSER SAFETY] Last successful chunk:', lastSuccessfulChunk);
    
    writeFileSync('.nova-parser-safety.json', JSON.stringify(rawEvents, null, 2));
    console.log('[PARSER SAFETY] Events saved to .nova-parser-safety.json');
    
  } catch (error: any) {
    console.error('[PARSER SAFETY ERROR]', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      lastSuccessfulChunk
    });
    
    writeFileSync('.nova-parser-error.json', JSON.stringify({ 
      error: { message: error.message, name: error.name, stack: error.stack },
      lastSuccessfulChunk,
      rawEvents 
    }, null, 2));
  }
}

testWithParserSafety();
