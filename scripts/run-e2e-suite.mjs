import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const PRODUCT_SPECS = [
  'tests/project-lifecycle.spec.ts',
  'tests/project-forms.spec.ts',
  'tests/project-agent-scoping.spec.ts',
  'tests/project-architecture.spec.ts',
  'tests/agents.spec.ts',
  'tests/default-agent-workflow.spec.ts',
  'tests/builtin-runtime-workflow.spec.ts',
  'tests/playbooks.spec.ts',
  'tests/prompts.spec.ts',
  'tests/registry.spec.ts',
  'tests/registry-install.spec.ts',
  'tests/system-registry.spec.ts',
  'tests/skills.spec.ts',
  'tests/connections-crud.spec.ts',
  'tests/connect-modal.spec.ts',
  'tests/connect-reconnect-banner.spec.ts',
  'tests/plugin-update.spec.ts',
  'tests/plugin-preview.spec.ts',
  'tests/plugin-system.spec.ts',
  'tests/schedule-runs.spec.ts',
  'tests/monitoring.spec.ts',
  'tests/orchestration-provider-picker.spec.ts',
  'tests/orchestration-chat-flow.spec.ts',
  'tests/orchestration-recovery.spec.ts',
  'tests/new-chat-provider-managed.spec.ts',
];

const SMOKE_LIVE_SPECS = ['tests/ui-crud-smoke.spec.ts'];

function parseSuite(argv) {
  const suiteArg = argv.find((arg) => arg.startsWith('--suite='));
  const suite = suiteArg?.split('=')[1] ?? 'product';
  if (!['product', 'smoke-live'].includes(suite)) {
    throw new Error(`Unknown E2E suite '${suite}'. Use product or smoke-live.`);
  }
  return suite;
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a port')));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function findFreePortBlock(size) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const start = await findFreePort();
    const checks = await Promise.all(
      Array.from({ length: size }, (_, offset) =>
        isPortAvailable(start + offset),
      ),
    );
    if (checks.every(Boolean)) {
      return start;
    }
  }

  throw new Error(`Failed to allocate ${size} contiguous ports`);
}

async function findFreePortOutside(blockStart, blockSize) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const port = await findFreePort();
    if (port < blockStart || port >= blockStart + blockSize) {
      return port;
    }
  }

  throw new Error('Failed to allocate a UI port outside the server port block');
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function main() {
  const suite = parseSuite(process.argv.slice(2));
  const specs = suite === 'product' ? PRODUCT_SPECS : SMOKE_LIVE_SPECS;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const instance = `e2e-${suite}-${suffix}`;
  const serverPort = await findFreePortBlock(3);
  const uiPort = await findFreePortOutside(serverPort, 3);

  try {
    await run('./stallion', [
      'start',
      `--instance=${instance}`,
      '--temp-home',
      '--clean',
      '--force',
      `--port=${serverPort}`,
      `--ui-port=${uiPort}`,
    ]);

    await run('npx', ['playwright', 'test', '--workers=1', ...specs], {
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: '0',
        PW_BASE_URL: `http://localhost:${uiPort}`,
        STALLION_PORT: String(serverPort),
      },
    });
  } finally {
    await run('./stallion', ['stop', `--instance=${instance}`]).catch(
      (error) => {
        console.error(`Failed to stop ${instance}:`, error);
      },
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
