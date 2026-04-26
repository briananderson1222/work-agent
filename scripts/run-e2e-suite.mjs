import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import {
  getSpecsForSuite,
  validateE2EManifest,
} from '../tests/e2e-manifest.mjs';

const SUPPORTED_SUITES = [
  'product',
  'smoke-live',
  'extended',
  'audit',
  'screenshot',
];

function parseSuite(argv) {
  const suiteArg = argv.find((arg) => arg.startsWith('--suite='));
  const suite = suiteArg?.split('=')[1] ?? 'product';
  if (!SUPPORTED_SUITES.includes(suite)) {
    throw new Error(
      `Unknown E2E suite '${suite}'. Use ${SUPPORTED_SUITES.join(', ')}.`,
    );
  }
  return suite;
}

function shouldListSpecs(argv) {
  return argv.includes('--list') || argv.includes('--dry-run');
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
  const argv = process.argv.slice(2);
  const suite = parseSuite(argv);
  const manifestResult = validateE2EManifest({
    rootDir: process.cwd(),
    readFile: (filePath) => readFileSync(filePath, 'utf8'),
  });
  if (!manifestResult.valid) {
    throw new Error(
      `E2E manifest is invalid:\n${manifestResult.errors.join('\n')}`,
    );
  }
  const specs = getSpecsForSuite(suite);
  if (specs.length === 0) {
    throw new Error(`E2E suite '${suite}' has no specs.`);
  }
  if (shouldListSpecs(argv)) {
    console.log(JSON.stringify({ suite, specs }, null, 2));
    return;
  }
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
        PW_API_BASE_URL: `http://localhost:${serverPort}`,
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
