/**
 * Stallion - VoltAgent-based local-first AI agent system
 * Main entry point
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
// import 'dotenv/config';
import { WorkAgentRuntime } from './runtime/voltagent-runtime.js';

async function main() {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3141;
  const workAgentDir =
    process.env.WORK_AGENT_DIR || join(homedir(), '.work-agent');

  const runtime = new WorkAgentRuntime({
    workAgentDir,
    port,
    logLevel: 'info',
  });

  try {
    await runtime.initialize();

    console.log('\\n═══════════════════════════════════════════════════');
    console.log('  WORK AGENT SYSTEM STARTED');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  ✓ HTTP Server:  http://localhost:${port}`);
    console.log(`  ✓ Swagger UI:   http://localhost:${port}/ui`);
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
    console.error('Failed to start Stallion:', error);
    process.exit(1);
  }
}

main();
