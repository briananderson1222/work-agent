import { execFile } from 'node:child_process';
import { Hono } from 'hono';
import { checkBedrockCredentials } from '../providers/bedrock.js';
import { getAllPrerequisites } from '../providers/registry.js';
import { systemOps } from '../telemetry/metrics.js';
import type {
  CapabilityState,
  ConfiguredProvider,
  SystemRecommendation,
  SystemStatusDeps,
} from './system-route-types.js';

function normalizeConfiguredProviders(
  providers: ConfiguredProvider[],
): Array<ConfiguredProvider & { capabilities: string[] }> {
  return providers.map((provider) => ({
    ...provider,
    capabilities: provider.capabilities ?? [],
  }));
}

function buildCapabilityStates(input: {
  credentialsFound: boolean;
  ollamaReachable: boolean;
  codexInstalled: boolean;
  claudeInstalled: boolean;
  acpConnected: boolean;
  configuredProviders: Array<ConfiguredProvider & { capabilities: string[] }>;
}): Record<string, CapabilityState> {
  const configuredLlmProviders = input.configuredProviders.filter(
    (provider) => provider.enabled && provider.capabilities.includes('llm'),
  );
  const knowledgeProviders = input.configuredProviders.filter(
    (provider) =>
      provider.enabled && provider.capabilities.includes('vectordb'),
  );

  return {
    chat: {
      ready: configuredLlmProviders.length > 0,
      source: configuredLlmProviders[0]?.type ?? null,
    },
    runtime: {
      ready:
        input.credentialsFound ||
        input.codexInstalled ||
        input.claudeInstalled ||
        input.acpConnected,
      source: input.acpConnected
        ? 'acp'
        : input.codexInstalled
          ? 'codex-cli'
          : input.claudeInstalled
            ? 'claude-cli'
            : input.credentialsFound
              ? 'bedrock-detected'
              : null,
    },
    knowledge: {
      ready: knowledgeProviders.length > 0,
      source: knowledgeProviders[0]?.type ?? null,
    },
    acp: {
      ready: input.acpConnected,
      source: input.acpConnected ? 'acp' : null,
    },
  };
}

function buildSystemRecommendation(input: {
  configuredProviders: Array<ConfiguredProvider & { capabilities: string[] }>;
  credentialsFound: boolean;
  ollamaReachable: boolean;
  codexInstalled: boolean;
  claudeInstalled: boolean;
  acpConnected: boolean;
}): SystemRecommendation {
  const detectedProvider = input.ollamaReachable
    ? { type: 'ollama', label: 'Ollama' }
    : input.credentialsFound
      ? { type: 'bedrock', label: 'Amazon Bedrock' }
      : null;
  const enabledLlmProvider = input.configuredProviders.find(
    (provider) => provider.enabled && provider.capabilities.includes('llm'),
  );
  if (enabledLlmProvider) {
    return {
      code: 'configured-chat-ready',
      type: 'providers',
      actionLabel: 'Review model connections',
      title: 'A chat-capable model connection is already configured',
      detail: `Stallion can already route chat through ${enabledLlmProvider.type}. Review connections if you want to change the default.`,
    };
  }
  const configuredLlmProvider = input.configuredProviders.find((provider) =>
    provider.capabilities.includes('llm'),
  );
  if (configuredLlmProvider) {
    return {
      code: 'configured-no-chat',
      type: 'providers',
      actionLabel: 'Manage model connections',
      title: 'No chat-capable connection is enabled',
      detail:
        'Model connections are configured, but none can run chat yet. Enable or repair a model connection in Connections.',
    };
  }
  if (detectedProvider) {
    return {
      code: 'detected-provider',
      type: 'providers',
      actionLabel: `Add ${detectedProvider.label} connection`,
      title: `${detectedProvider.label} is available`,
      detail:
        detectedProvider.type === 'ollama'
          ? 'Create a model connection for the detected local Ollama server to make first-run chat explicit.'
          : 'Detected credentials can back a Bedrock model connection if you want Stallion to use it for chat.',
      detectedProviderType: detectedProvider.type,
      detectedProviderLabel: detectedProvider.label,
    };
  }
  if (input.codexInstalled || input.claudeInstalled || input.acpConnected) {
    return {
      code: 'runtime-only',
      type: 'runtimes',
      actionLabel: 'Review runtimes',
      title: 'A runtime is available before chat is configured',
      detail:
        'Connected runtimes are detectable, but there is still no explicit chat-capable model connection configured.',
    };
  }
  return {
    code: 'unconfigured',
    type: 'connections',
    actionLabel: 'Open Connections',
    title: 'No usable AI path is configured yet',
    detail:
      'Start Ollama locally or add a provider/runtime connection to make Stallion ready for first-run chat.',
  };
}

const whichCmd = (cmd: string) =>
  new Promise<boolean>((resolve) => {
    execFile('which', [cmd], (err, stdout) =>
      resolve(!err && stdout.trim().length > 0),
    );
  });

export function createSystemStatusRoutes(deps: SystemStatusDeps) {
  const app = new Hono();

  app.get('/status', async (c) => {
    const [
      credentialsFound,
      kiroCliInstalled,
      ollamaReachable,
      codexInstalled,
      claudeInstalled,
    ] = await Promise.all([
      checkBedrockCredentials(),
      whichCmd('kiro-cli'),
      deps.checkOllamaAvailability?.() ?? Promise.resolve(false),
      whichCmd('codex'),
      whichCmd('claude'),
    ]);
    systemOps.add(1, { op: 'get_status' });

    const acpStatus = deps.getACPStatus();
    const configuredProviders = normalizeConfiguredProviders(
      deps.listProviderConnections?.() ?? [],
    );
    const configuredLlmProviders = configuredProviders.filter(
      (provider) => provider.enabled && provider.capabilities.includes('llm'),
    );
    const capabilities = buildCapabilityStates({
      credentialsFound,
      ollamaReachable,
      codexInstalled,
      claudeInstalled,
      acpConnected: acpStatus.connected,
      configuredProviders,
    });
    const recommendation = buildSystemRecommendation({
      configuredProviders,
      credentialsFound,
      ollamaReachable,
      codexInstalled,
      claudeInstalled,
      acpConnected: acpStatus.connected,
    });
    const prerequisites = await getAllPrerequisites();

    return c.json({
      prerequisites,
      acp: {
        connected: acpStatus.connected,
        connections: acpStatus.connections,
      },
      providers: {
        configuredChatReady: configuredLlmProviders.length > 0,
        configured: configuredProviders.map((provider) => ({
          id: provider.id,
          type: provider.type,
          enabled: provider.enabled,
          capabilities: provider.capabilities ?? [],
        })),
        detected: {
          ollama: ollamaReachable,
          bedrock: credentialsFound,
        },
      },
      clis: {
        'kiro-cli': kiroCliInstalled,
        codex: codexInstalled,
        claude: claudeInstalled,
      },
      capabilities,
      recommendation,
      ready:
        credentialsFound ||
        ollamaReachable ||
        configuredLlmProviders.length > 0 ||
        acpStatus.connected,
    });
  });

  app.get('/capabilities', (c) => {
    systemOps.add(1, { op: 'get_capabilities' });
    const appConfig = deps.getAppConfig();
    return c.json({
      runtime: appConfig.runtime || 'voltagent',
      voice: {
        stt: [
          {
            id: 'webspeech',
            name: 'WebSpeech (Browser)',
            clientOnly: true,
            visibleOn: ['all'],
            configured: true,
          },
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
      scheduler: true,
    });
  });

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

  app.get('/runtime', (c) => {
    const cfg = deps.appConfig ?? deps.getAppConfig();
    return c.json({ runtime: cfg.runtime || 'voltagent' });
  });

  app.get('/skills', (c) => {
    return c.json({
      success: true,
      data: deps.skillService?.listSkills() ?? [],
    });
  });

  app.get('/terminal-port', (c) => {
    const port = deps.port ?? 0;
    return c.json({ success: true, port: port + 1 });
  });

  return app;
}
