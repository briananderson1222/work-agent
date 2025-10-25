/**
 * Simple CLI for interacting with Work Agent
 */

import 'dotenv/config';
import { createInterface } from 'readline';
import { WorkAgentRuntime } from './runtime/voltagent-runtime.js';

async function main() {
  const runtime = new WorkAgentRuntime({
    workAgentDir: '.work-agent',
    logLevel: 'warn', // Less verbose for CLI
  });

  await runtime.initialize();

  const agents = runtime.listAgents();

  if (agents.length === 0) {
    console.log('No agents found. Please create an agent in .work-agent/agents/');
    process.exit(1);
  }

  console.log('\\n╔════════════════════════════════════════╗');
  console.log('║        Work Agent CLI                 ║');
  console.log('╚════════════════════════════════════════╝\\n');
  console.log('Available agents:', agents.join(', '));
  console.log('\\nCommands:');
  console.log('  /switch <agent>  - Switch to a different agent');
  console.log('  /list            - List all agents');
  console.log('  /quit            - Exit the CLI');
  console.log('\\n');

  let currentAgentSlug = agents[0];
  let currentAgent = runtime.getAgent(currentAgentSlug);

  if (!currentAgent) {
    console.error('Failed to load agent');
    process.exit(1);
  }

  console.log(`Using agent: ${currentAgentSlug}\\n`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `[${currentAgentSlug}] > `,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Handle commands
    if (input.startsWith('/')) {
      const [command, ...args] = input.slice(1).split(' ');

      switch (command) {
        case 'switch':
          if (args.length === 0) {
            console.log('Usage: /switch <agent>');
          } else {
            const targetSlug = args[0];
            try {
              const agent = await runtime.switchAgent(targetSlug);
              currentAgentSlug = targetSlug;
              currentAgent = agent;
              console.log(`Switched to agent: ${targetSlug}`);
              rl.setPrompt(`[${currentAgentSlug}] > `);
            } catch (error) {
              console.error(`Failed to switch to agent ${targetSlug}:`, error);
            }
          }
          break;

        case 'list':
          console.log('Available agents:', runtime.listAgents().join(', '));
          break;

        case 'quit':
        case 'exit':
          console.log('\\nGoodbye!');
          await runtime.shutdown();
          process.exit(0);
          break;

        default:
          console.log(`Unknown command: ${command}`);
      }

      rl.prompt();
      return;
    }

    // Send message to agent
    try {
      const response = await currentAgent.generateText(input, {
        userId: `agent:${currentAgentSlug}:user:cli`,
        conversationId: 'cli-session',
      });

      console.log(`\\n${response.text}\\n`);
    } catch (error: any) {
      console.error('Error:', error.message);
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    console.log('\\nGoodbye!');
    await runtime.shutdown();
    process.exit(0);
  });

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    console.log('\\n\\nShutting down...');
    await runtime.shutdown();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
