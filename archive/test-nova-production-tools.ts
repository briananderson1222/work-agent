#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { readFileSync, readdirSync } from 'fs';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

// Load actual production tools from debug file
function loadProductionTools() {
  try {
    const debugFiles = readdirSync('.')
      .filter((f: string) => f.startsWith('.bedrock-debug-') && f.endsWith('-request.json'))
      .sort()
      .reverse();
    
    if (debugFiles.length === 0) {
      console.log('❌ No debug files found. Run production agent first to generate debug files.');
      process.exit(1);
    }
    
    const latestDebug = debugFiles[0];
    console.log(`📁 Loading tools from: ${latestDebug}`);
    
    const request = JSON.parse(readFileSync(latestDebug, 'utf-8'));
    const tools = request.toolConfig?.tools || [];
    
    console.log(`📊 Loaded ${tools.length} production tools`);
    console.log(`📏 Total size: ${JSON.stringify(tools).length} bytes (~${Math.round(JSON.stringify(tools).length / 4)} tokens)\n`);
    
    return tools;
  } catch (error: any) {
    console.log('❌ Error loading production tools:', error.message);
    process.exit(1);
  }
}

async function testWithProductionTools() {
  const tools = loadProductionTools();
  
  console.log('🧪 Testing Nova STREAMING with production tools\n');
  
  try {
    const command = new ConverseStreamCommand({
      modelId: 'us.amazon.nova-pro-v1:0',
      messages: [{ role: 'user', content: [{ text: 'What is on my calendar for today?' }] }],
      toolConfig: { tools }
    });

    const response = await client.send(command);
    let chunks = 0;
    let chars = 0;
    
    for await (const chunk of response.stream!) {
      chunks++;
      
      if (chunk.contentBlockDelta?.delta?.text) {
        const text = chunk.contentBlockDelta.delta.text;
        chars += text.length;
        process.stdout.write(text);
      }
      
      if (chunk.contentBlockStart?.start?.toolUse) {
        console.log(`\n\n✅ Tool invocation started at chunk ${chunks}`);
        console.log('Tool:', chunk.contentBlockStart.start.toolUse.name);
      }
    }
    
    console.log(`\n\n✅ SUCCESS: ${chunks} chunks, ${chars} characters`);
  } catch (error: any) {
    if (error.message?.includes('NGHTTP2_INTERNAL_ERROR')) {
      console.log('\n\n❌ CRASH: NGHTTP2_INTERNAL_ERROR');
      console.log('This confirms the production tool crash!');
    } else {
      console.log('\n\n❌ ERROR:', error.message);
    }
  }
}

testWithProductionTools().catch(console.error);
