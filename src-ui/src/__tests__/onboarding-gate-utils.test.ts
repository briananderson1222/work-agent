import type { SystemStatus } from '@stallion-ai/sdk';
import { describe, expect, test } from 'vitest';
import {
  buildSetupBannerContent,
  configuredLlmProviders,
  setupBannerVariant,
  shouldShowSetupBanner,
} from '../components/onboardingGateUtils';

function createStatus(overrides: Partial<SystemStatus> = {}): SystemStatus {
  return {
    prerequisites: [],
    bedrock: {
      credentialsFound: false,
      verified: null,
      region: null,
    },
    acp: {
      connected: false,
      connections: [],
    },
    providers: {
      configuredChatReady: false,
      configured: [],
      detected: {
        ollama: false,
        bedrock: false,
      },
    },
    clis: {},
    recommendation: {
      code: 'unconfigured',
      type: 'connections',
      actionLabel: 'Open Connections',
      title: 'No usable AI path is configured yet',
      detail:
        'Start Ollama locally or add a provider/runtime connection to make Stallion ready for first-run chat.',
    },
    ready: false,
    ...overrides,
  };
}

describe('onboardingGateUtils', () => {
  test('shows generic setup guidance when nothing is configured or detected', () => {
    const status = createStatus();

    expect(shouldShowSetupBanner(status)).toBe(true);
    expect(setupBannerVariant(status)).toBe('unconfigured');
    expect(configuredLlmProviders(status)).toEqual([]);
    expect(buildSetupBannerContent(status)).toEqual({
      title: 'No AI connection configured yet',
      description:
        'Start Ollama locally or add a provider connection in Connections. You can configure Bedrock, OpenAI-compatible endpoints, Claude, Codex, or ACP later.',
      actionLabel: 'Manage Connections',
      badges: [],
      actionTarget: 'providers',
    });
  });

  test('shows detection-led guidance when Ollama is reachable', () => {
    const status = createStatus({
      providers: {
        configuredChatReady: false,
        configured: [],
        detected: {
          ollama: true,
          bedrock: false,
        },
      },
      recommendation: {
        code: 'detected-ollama',
        type: 'providers',
        actionLabel: 'Add Ollama connection',
        title: 'Ollama is reachable locally',
        detail:
          'Create a model connection for the detected local Ollama server to make first-run chat explicit.',
      },
      ready: true,
    });

    expect(shouldShowSetupBanner(status)).toBe(true);
    expect(setupBannerVariant(status)).toBe('detected-ollama');
    expect(buildSetupBannerContent(status)).toEqual({
      title: 'Ollama detected locally',
      description:
        'A local Ollama server is reachable. Open Connections to review or save a chat-capable model provider.',
      actionLabel: 'Review Connections',
      badges: ['Detected: Ollama'],
      actionTarget: 'providers',
    });
  });

  test('shows generic setup guidance when only vectordb providers exist', () => {
    const status = createStatus({
      providers: {
        configuredChatReady: false,
        configured: [
          {
            id: 'lancedb-builtin',
            type: 'lancedb',
            enabled: true,
            capabilities: ['vectordb'],
          },
        ],
        detected: {
          ollama: false,
          bedrock: false,
        },
      },
      recommendation: {
        code: 'unconfigured',
        type: 'connections',
        actionLabel: 'Open Connections',
        title: 'No usable AI path is configured yet',
        detail:
          'Start Ollama locally or add a provider/runtime connection to make Stallion ready for first-run chat.',
      },
    });

    expect(shouldShowSetupBanner(status)).toBe(true);
    expect(setupBannerVariant(status)).toBe('unconfigured');
    expect(buildSetupBannerContent(status)).toEqual({
      title: 'No AI connection configured yet',
      description:
        'Start Ollama locally or add a provider connection in Connections. You can configure Bedrock, OpenAI-compatible endpoints, Claude, Codex, or ACP later.',
      actionLabel: 'Manage Connections',
      badges: [],
      actionTarget: 'providers',
    });
  });

  test('prefers ollama detection over vectordb-only configured providers', () => {
    const status = createStatus({
      providers: {
        configuredChatReady: false,
        configured: [
          {
            id: 'lancedb-builtin',
            type: 'lancedb',
            enabled: true,
            capabilities: ['vectordb'],
          },
        ],
        detected: {
          ollama: true,
          bedrock: false,
        },
      },
      recommendation: {
        code: 'detected-ollama',
        type: 'providers',
        actionLabel: 'Add Ollama connection',
        title: 'Ollama is reachable locally',
        detail:
          'Create a model connection for the detected local Ollama server to make first-run chat explicit.',
      },
      ready: true,
    });

    expect(setupBannerVariant(status)).toBe('detected-ollama');
  });

  test('hides the setup banner once a configured llm provider exists', () => {
    const status = createStatus({
      providers: {
        configuredChatReady: true,
        configured: [
          {
            id: 'ollama-local',
            type: 'ollama',
            enabled: true,
            capabilities: ['llm', 'embedding'],
          },
        ],
        detected: {
          ollama: true,
          bedrock: false,
        },
      },
      recommendation: {
        code: 'configured-chat-ready',
        type: 'providers',
        actionLabel: 'Review model connections',
        title: 'A chat-capable model connection is already configured',
        detail:
          'Stallion can already route chat through ollama. Review connections if you want to change the default.',
      },
      ready: true,
    });

    expect(configuredLlmProviders(status)).toHaveLength(1);
    expect(setupBannerVariant(status)).toBe('hidden');
    expect(shouldShowSetupBanner(status)).toBe(false);
  });

  test('hides the setup banner for ACP-connected sessions', () => {
    const status = createStatus({
      acp: {
        connected: true,
        connections: [{ id: 'kiro', status: 'available' }],
      },
      ready: true,
    });

    expect(setupBannerVariant(status)).toBe('hidden');
    expect(shouldShowSetupBanner(status)).toBe(false);
  });

  test('shows disabled llm providers as configured but not enabled', () => {
    const status = createStatus({
      providers: {
        configuredChatReady: false,
        configured: [
          {
            id: 'bedrock-default',
            type: 'bedrock',
            enabled: false,
            capabilities: ['llm'],
          },
        ],
        detected: {
          ollama: false,
          bedrock: true,
        },
      },
      recommendation: {
        code: 'configured-no-chat',
        type: 'providers',
        actionLabel: 'Manage model connections',
        title: 'No chat-capable connection is enabled',
        detail:
          'Model connections are configured, but none can run chat yet. Enable or repair a model connection in Connections.',
      },
    });

    expect(configuredLlmProviders(status)).toEqual([]);
    expect(setupBannerVariant(status)).toBe('configured-no-chat');
    expect(buildSetupBannerContent(status)).toEqual({
      title: 'No chat-capable connection is enabled',
      description:
        'Connections are configured, but none can run chat yet. Add or enable a model provider in Connections.',
      actionLabel: 'Manage Connections',
      badges: ['Disabled: Amazon Bedrock'],
      actionTarget: 'providers',
    });
  });

  test('shows runtime guidance when only connected runtimes are available', () => {
    const status = createStatus({
      recommendation: {
        code: 'runtime-only',
        type: 'runtimes',
        actionLabel: 'Review runtimes',
        title: 'A runtime is available before chat is configured',
        detail:
          'Connected runtimes are detectable, but there is still no explicit chat-capable model connection configured.',
      },
      clis: {
        codex: true,
      },
      ready: false,
    });

    expect(setupBannerVariant(status)).toBe('runtime-only');
    expect(buildSetupBannerContent(status)).toEqual({
      title: 'A runtime is available before chat is configured',
      description:
        'Connected runtimes are detectable, but there is still no explicit chat-capable model connection configured.',
      actionLabel: 'Review Runtimes',
      badges: [],
      actionTarget: 'runtimes',
    });
  });
});
