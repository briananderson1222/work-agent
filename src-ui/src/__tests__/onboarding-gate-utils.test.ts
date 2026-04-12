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
      configured: [],
      detected: {
        ollama: false,
        bedrock: false,
      },
    },
    clis: {},
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
        configured: [],
        detected: {
          ollama: true,
          bedrock: false,
        },
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

  test('shows non-chat-provider guidance when only vectordb providers exist', () => {
    const status = createStatus({
      providers: {
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
    });

    expect(shouldShowSetupBanner(status)).toBe(true);
    expect(setupBannerVariant(status)).toBe('configured-no-chat');
    expect(buildSetupBannerContent(status)).toEqual({
      title: 'No chat-capable connection is enabled',
      description:
        'Connections are configured, but none can run chat yet. Add or enable a model provider in Connections.',
      actionLabel: 'Manage Connections',
      badges: ['Configured: lancedb'],
      actionTarget: 'providers',
    });
  });

  test('hides the setup banner once a configured llm provider exists', () => {
    const status = createStatus({
      providers: {
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
});
