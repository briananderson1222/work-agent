import { Agent } from '@voltagent/core';
import { createBedrockProvider } from './src-server/providers/bedrock.js';
import { z } from 'zod';

const appConfig = {
  region: 'us-east-1',
  defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0'
};

const agentSpec = {
  model: 'anthropic.claude-3-5-sonnet-20240620-v1:0'
};

const provider = createBedrockProvider({ appConfig, agentSpec });

const testTool = {
  name: 'get_weather',
  description: 'Get the weather for a location',
  parameters: z.object({
    location: z.string().describe('The city name')
  }),
  execute: async ({ location }: { location: string }) => {
    console.log(`[TOOL CALLED] get_weather for ${location}`);
    return { temperature: 72, condition: 'sunny', location };
  }
};

const agent = new Agent({
  name: 'test-agent',
  instructions: 'You are a helpful assistant.',
  model: provider,
  tools: [testTool]
});

const schema = z.object({
  location: z.string(),
  weather: z.object({
    temperature: z.number(),
    condition: z.string()
  })
});

async function test() {
  console.log('\n=== Testing generateObject with tools ===\n');
  
  try {
    const result = await agent.generateObject(
      'What is the weather in San Francisco? Return the location and weather data.',
      schema
    );
    
    console.log('\n✅ SUCCESS - generateObject completed');
    console.log('Result:', JSON.stringify(result.object, null, 2));
    console.log('Steps:', result.steps?.length || 0);
    
  } catch (error: any) {
    console.log('\n❌ FAILED - generateObject with tools');
    console.log('Error:', error.message);
  }
}

test().catch(console.error);
