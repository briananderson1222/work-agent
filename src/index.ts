/**
 * Work Agent - VoltAgent-based local-first AI agent system
 * Main entry point
 */

import 'dotenv/config';
import { WorkAgentRuntime } from './runtime/voltagent-runtime.js';

async function main() {
  const runtime = new WorkAgentRuntime({
    workAgentDir: '.work-agent',
    port: 3141,
    logLevel: 'info',
  });

  try {
    await runtime.initialize();

    console.log('\\n═══════════════════════════════════════════════════');
    console.log('  WORK AGENT SYSTEM STARTED');
    console.log('═══════════════════════════════════════════════════');
    console.log('  ✓ HTTP Server:  http://localhost:3141');
    console.log('  ✓ Swagger UI:   http://localhost:3141/ui');
    console.log('  ✓ VoltOps:      https://console.voltagent.dev');
    console.log('');
    console.log('  Loaded agents:', runtime.listAgents().join(', '));
    console.log('═══════════════════════════════════════════════════\\n');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\\n\\nShutting down gracefully...');
      await runtime.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\\n\\nShutting down gracefully...');
      await runtime.shutdown();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start Work Agent:', error);
    process.exit(1);
  }
}

main();
