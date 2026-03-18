import 'dotenv/config';
import './telemetry.js';

/**
 * Stallion AI — local-first AI agent system
 * Main entry point
 */

import { StallionRuntime } from './runtime/stallion-runtime.js';
import { resolveHomeDir } from './utils/paths.js';

async function main() {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3141;
  const projectHomeDir = resolveHomeDir();

  const runtime = new StallionRuntime({
    projectHomeDir,
    port,
    logLevel: 'info',
  });

  try {
    await runtime.initialize();
    let shuttingDown = false;

    console.log('\\n═══════════════════════════════════════════════════');
    console.log('  STALLION AI STARTED');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  ✓ HTTP Server:  http://localhost:${port}`);
    console.log(`  ✓ Swagger UI:   http://localhost:${port}/ui`);
    console.log('');
    console.log('  Loaded agents:', runtime.listAgents().join(', '));
    console.log('═══════════════════════════════════════════════════\\n');

    const gracefulShutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`\n\nShutting down gracefully (${signal})...`);
      await runtime.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      gracefulShutdown('unhandledRejection');
    });
    process.on('uncaughtException', (err) => {
      console.error('Uncaught exception:', err);
      gracefulShutdown('uncaughtException');
    });
  } catch (error) {
    console.error('Failed to start Stallion:', error);
    process.exit(1);
  }
}

main();
