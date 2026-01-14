#!/usr/bin/env node
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

async function test(name: string, toolName: string, prompt: string, expectToolUse: boolean) {
  console.log(`\n🧪 ${name}`);
  console.log(`   Tool: "${toolName}"`);
  console.log(`   Prompt: "${prompt}"`);
  console.log(`   Expect tool use: ${expectToolUse ? 'YES' : 'NO'}`);
  
  const tools = [{
    toolSpec: {
      name: toolName,
      description: 'A test tool',
      inputSchema: {
        json: {
          type: 'object',
          properties: { input: { type: 'string' } }
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
    let toolUsed = false;
    
    for await (const chunk of response.stream!) {
      if (chunk.contentBlockStart?.start?.toolUse) {
        toolUsed = true;
        console.log(`   ✅ PASS - Tool invoked`);
        return;
      }
    }
    
    if (!toolUsed) {
      console.log(`   ✅ PASS - No tool invocation`);
    }
  } catch (error: any) {
    console.log(`   ❌ CRASH`);
  }
}

async function run() {
  console.log('🔍 Hypothesis: Crash only when Nova decides to invoke a hyphenated tool\n');
  
  // Scenario 1: Hyphen tool, explicit instruction to use it
  await test(
    '1. Hyphen tool + explicit use instruction',
    'my-tool',
    'Use my-tool with input "test"',
    true
  );
  await new Promise(r => setTimeout(r, 1000));
  
  // Scenario 2: Hyphen tool, vague prompt (unlikely to use tool)
  await test(
    '2. Hyphen tool + vague prompt',
    'my-tool',
    'Hello, how are you?',
    false
  );
  await new Promise(r => setTimeout(r, 1000));
  
  // Scenario 3: Hyphen tool, relevant but not explicit
  await test(
    '3. Hyphen tool + relevant prompt',
    'weather-tool',
    'What is the weather like?',
    true
  );
  await new Promise(r => setTimeout(r, 1000));
  
  // Scenario 4: No hyphen, explicit instruction
  await test(
    '4. No hyphen + explicit use instruction',
    'my_tool',
    'Use my_tool with input "test"',
    true
  );
  await new Promise(r => setTimeout(r, 1000));
  
  // Scenario 5: Hyphen tool with very detailed description (might prevent tool use)
  console.log('\n🧪 5. Hyphen tool + detailed description + explicit use');
  console.log('   Tool: "my-tool"');
  console.log('   Desc: "This is a very detailed description..."');
  console.log('   Prompt: "Use my-tool"');
  
  const tools = [{
    toolSpec: {
      name: 'my-tool',
      description: 'This is a very detailed description of the tool that explains what it does in great detail and provides extensive context about its purpose and usage patterns',
      inputSchema: {
        json: {
          type: 'object',
          properties: { input: { type: 'string' } }
        }
      }
    }
  }];
  
  try {
    const command = new ConverseStreamCommand({
      modelId: 'us.amazon.nova-pro-v1:0',
      messages: [{ role: 'user', content: [{ text: 'Use my-tool with input "test"' }] }],
      toolConfig: { tools }
    });

    const response = await client.send(command);
    for await (const chunk of response.stream!) {
      if (chunk.contentBlockStart?.start?.toolUse) {
        console.log(`   ✅ PASS - Tool invoked`);
        return;
      }
    }
    console.log(`   ✅ PASS - No tool invocation`);
  } catch (error: any) {
    console.log(`   ❌ CRASH`);
  }
}

run().catch(console.error);
