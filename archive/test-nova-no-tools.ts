/**
 * Test Nova streaming WITHOUT tools to isolate if tools are the issue
 */

import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

async function testNovaNoTools() {
  const client = new BedrockRuntimeClient({
    region: 'us-east-1',
    credentials: fromNodeProviderChain(),
  });

  const command = new ConverseStreamCommand({
    modelId: 'us.amazon.nova-pro-v1:0',
    messages: [{
      role: 'user',
      content: [{ text: 'What is on my calendar for today? Please explain in detail what you would need to check my calendar.' }]
    }],
    // NO toolConfig - testing without tools
    inferenceConfig: {
      maxTokens: 4096,
      temperature: 0.7
    }
  });

  console.log('[NO TOOLS TEST] Starting Nova stream WITHOUT tools...');
  
  try {
    const response = await client.send(command);
    
    if (!response.stream) {
      console.error('[NO TOOLS TEST] No stream in response');
      return;
    }

    let chunkCount = 0;
    let textAccumulated = '';
    
    for await (const event of response.stream) {
      if (event.contentBlockDelta?.delta?.text) {
        const text = event.contentBlockDelta.delta.text;
        textAccumulated += text;
        process.stdout.write(text);
      }
      chunkCount++;
    }
    
    console.log('\n[NO TOOLS TEST] Stream completed successfully');
    console.log('[NO TOOLS TEST] Total chunks:', chunkCount);
    console.log('[NO TOOLS TEST] Total text length:', textAccumulated.length);
    
  } catch (error: any) {
    console.error('[NO TOOLS TEST ERROR]', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
  }
}

testNovaNoTools();
