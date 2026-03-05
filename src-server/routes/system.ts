/**
 * System status routes — unified readiness check for onboarding
 */

import { execFile, execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { checkBedrockCredentials } from '../providers/bedrock.js';
import { getOnboardingProviders } from '../providers/registry.js';

interface SystemStatusDeps {
  getACPStatus: () => {
    connected: boolean;
    connections: Array<{ id: string; status: string }>;
  };
  getAppConfig: () => { region: string; defaultModel: string };
  eventBus?: { emit: (event: string, data?: Record<string, unknown>) => void };
}

export function createSystemRoutes(deps: SystemStatusDeps, logger: any) {
  const app = new Hono();

  // Fast readiness check — credential resolution + ACP + boo
  const whichCmd = (cmd: string) =>
    new Promise<boolean>((resolve) => {
      execFile('which', [cmd], (err, stdout) =>
        resolve(!err && stdout.trim().length > 0),
      );
    });

  app.get('/status', async (c) => {
    const [credentialsFound, booInstalled, kiroCliInstalled, claudeInstalled] =
      await Promise.all([
        checkBedrockCredentials(),
        whichCmd('boo'),
        whichCmd('kiro-cli'),
        whichCmd('claude'),
      ]);

    const acpStatus = deps.getACPStatus();
    const config = deps.getAppConfig();

    // Aggregate onboarding prerequisites from all providers
    const providers = getOnboardingProviders();
    const prerequisiteArrays = await Promise.all(
      providers.map(({ provider, source }) =>
        provider.getPrerequisites()
          .then((items) => items.map((p) => ({ ...p, source })))
          .catch(() => []),
      ),
    );
    const prerequisites = prerequisiteArrays.flat();

    return c.json({
      prerequisites,
      bedrock: { credentialsFound, verified: null, region: config.region },
      acp: {
        connected: acpStatus.connected,
        connections: acpStatus.connections,
      },
      scheduler: { booInstalled },
      clis: { 'kiro-cli': kiroCliInstalled, claude: claudeInstalled },
      ready: credentialsFound || acpStatus.connected,
    });
  });

  // Heavier verification — actually calls ListFoundationModels
  app.post('/verify-bedrock', async (c) => {
    try {
      const { BedrockClient, ListFoundationModelsCommand } = await import(
        '@aws-sdk/client-bedrock'
      );
      const body = await c.req.json().catch(() => ({}));
      const region = body.region || deps.getAppConfig().region;
      const client = new BedrockClient({ region });
      await client.send(new ListFoundationModelsCommand({}));
      return c.json({ verified: true, region });
    } catch (error: any) {
      logger.warn('Bedrock verification failed', { error: error.message });
      return c.json({ verified: false, error: error.message });
    }
  });

  // Check for core app updates
  app.get('/core-update', async (c) => {
    try {
      const thisDir = dirname(fileURLToPath(import.meta.url));
      let gitRoot: string;
      try {
        gitRoot = execSync('git rev-parse --show-toplevel', {
          cwd: thisDir,
          encoding: 'utf-8',
        }).trim();
      } catch {
        // Fallback: tsx may mangle import.meta.url, walk up from process.argv
        const serverEntry = process.argv.find(a => a.includes('src-server'));
        const fallbackDir = serverEntry ? resolve(dirname(serverEntry)) : thisDir;
        gitRoot = execSync('git rev-parse --show-toplevel', {
          cwd: fallbackDir,
          encoding: 'utf-8',
        }).trim();
      }

      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: gitRoot,
        encoding: 'utf-8',
      }).trim();

      const currentHash = execSync('git rev-parse HEAD', {
        cwd: gitRoot,
        encoding: 'utf-8',
      })
        .trim()
        .substring(0, 7);

      // Check if upstream is configured
      let hasUpstream = false;
      try {
        execSync(`git rev-parse --abbrev-ref ${branch}@{u}`, {
          cwd: gitRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        hasUpstream = true;
      } catch {
        // No upstream
      }

      if (!hasUpstream) {
        return c.json({
          currentHash,
          branch,
          behind: 0,
          ahead: 0,
          updateAvailable: false,
          noUpstream: true,
        });
      }

      execSync('git fetch --quiet', { cwd: gitRoot, timeout: 15000 });

      const remoteHash = execSync('git rev-parse @{u}', {
        cwd: gitRoot,
        encoding: 'utf-8',
      })
        .trim()
        .substring(0, 7);

      const behind = parseInt(
        execSync('git rev-list HEAD..@{u} --count', {
          cwd: gitRoot,
          encoding: 'utf-8',
        }).trim(),
        10,
      );
      const ahead = parseInt(
        execSync('git rev-list @{u}..HEAD --count', {
          cwd: gitRoot,
          encoding: 'utf-8',
        }).trim(),
        10,
      );

      return c.json({
        currentHash,
        remoteHash,
        branch,
        behind,
        ahead,
        updateAvailable: behind > 0,
      });
    } catch (error: any) {
      return c.json({ updateAvailable: false, error: error.message });
    }
  });

  // Apply core app update
  app.post('/core-update', async (c) => {
    try {
      const thisDir = dirname(fileURLToPath(import.meta.url));
      let gitRoot: string;
      try {
        gitRoot = execSync('git rev-parse --show-toplevel', {
          cwd: thisDir,
          encoding: 'utf-8',
        }).trim();
      } catch {
        const serverEntry = process.argv.find(a => a.includes('src-server'));
        const fallbackDir = serverEntry ? resolve(dirname(serverEntry)) : thisDir;
        gitRoot = execSync('git rev-parse --show-toplevel', {
          cwd: fallbackDir,
          encoding: 'utf-8',
        }).trim();
      }

      // Pull updates
      execSync('git pull --ff-only', { cwd: gitRoot, timeout: 30000 });

      // Get new hash
      const newHash = execSync('git rev-parse HEAD', {
        cwd: gitRoot,
        encoding: 'utf-8',
      })
        .trim()
        .substring(0, 7);

      // Emit SSE event if eventBus is available
      deps.eventBus?.emit('core:updated', { hash: newHash });

      return c.json({
        success: true,
        hash: newHash,
        message: `Updated to ${newHash}. Restart to apply.`,
      });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Capabilities manifest — tells the client which voice/context providers are
  // available and configured on this server.  clientOnly providers are always
  // advertised; server-backed providers require credentials or API keys.
  app.get('/capabilities', (c) => {
    return c.json({
      voice: {
        stt: [
          {
            id: 'webspeech',
            name: 'WebSpeech (Browser)',
            clientOnly: true,
            visibleOn: ['all'],
            configured: true,
          },
          // Server-backed providers would be inserted here by plugin registrations
          // (e.g. ElevenLabs, Nova Sonic) with configured: true when credentials exist.
        ],
        tts: [
          {
            id: 'webspeech',
            name: 'WebSpeech (Browser)',
            clientOnly: true,
            visibleOn: ['all'],
            configured: true,
          },
        ],
      },
      context: {
        providers: [
          {
            id: 'geolocation',
            name: 'Geolocation',
            visibleOn: ['mobile'],
          },
          {
            id: 'timezone',
            name: 'Timezone',
            visibleOn: ['all'],
          },
        ],
      },
    });
  });

  // Discovery beacon — open CORS so LAN clients can probe without credentials.
  // Reveals nothing sensitive: just confirms this is a Stallion server.
  app.use('/discover', async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    return next();
  });

  app.get('/discover', (c) => {
    const reqUrl = new URL(c.req.url);
    return c.json({
      stallion: true,
      name: 'Project Stallion',
      port: Number(reqUrl.port) || 3141,
    });
  });

  return app;
}
