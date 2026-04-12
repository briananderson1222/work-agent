import type { SystemStatus } from '@stallion-ai/sdk';
import { connectionTypeLabel } from '../utils/execution';

type ConfiguredProvider = NonNullable<
  SystemStatus['providers']
>['configured'][number];

export interface SetupBannerContent {
  title: string;
  description: string;
  actionLabel: string;
  badges: string[];
  actionTarget: 'providers' | 'runtimes' | 'connections';
}

export type SetupBannerVariant =
  | 'hidden'
  | 'detected-ollama'
  | 'detected-bedrock'
  | 'configured-no-chat'
  | 'unconfigured';

function configuredProviders(status: SystemStatus): ConfiguredProvider[] {
  return status.providers?.configured ?? [];
}

function enabledConfiguredProviders(
  status: SystemStatus,
): ConfiguredProvider[] {
  return configuredProviders(status).filter((provider) => provider.enabled);
}

export function configuredLlmProviders(
  status: SystemStatus,
): ConfiguredProvider[] {
  return enabledConfiguredProviders(status).filter((provider) =>
    provider.capabilities.includes('llm'),
  );
}

export function setupBannerVariant(status: SystemStatus): SetupBannerVariant {
  if (status.acp.connected) {
    return 'hidden';
  }

  if (configuredLlmProviders(status).length > 0) {
    return 'hidden';
  }

  const configured = configuredProviders(status);
  if (configured.some((provider) => provider.capabilities.includes('llm'))) {
    return 'configured-no-chat';
  }

  if (enabledConfiguredProviders(status).length > 0) {
    return 'configured-no-chat';
  }

  const detected = status.providers?.detected;
  if (detected?.ollama) {
    return 'detected-ollama';
  }
  if (detected?.bedrock) {
    return 'detected-bedrock';
  }

  return 'unconfigured';
}

export function shouldShowSetupBanner(status: SystemStatus): boolean {
  return setupBannerVariant(status) !== 'hidden';
}

export function buildSetupBannerContent(
  status: SystemStatus,
): SetupBannerContent {
  const configured = configuredProviders(status);
  const enabledProviders = enabledConfiguredProviders(status);

  switch (setupBannerVariant(status)) {
    case 'detected-ollama':
      return {
        title: 'Ollama detected locally',
        description:
          'A local Ollama server is reachable. Open Connections to review or save a chat-capable model provider.',
        actionLabel: 'Review Connections',
        badges: ['Detected: Ollama'],
        actionTarget: 'providers',
      };
    case 'detected-bedrock':
      return {
        title: 'Bedrock credentials detected',
        description:
          'AWS credentials are available. Open Connections to review or save a Bedrock model provider for chat.',
        actionLabel: 'Review Connections',
        badges: ['Detected: Amazon Bedrock'],
        actionTarget: 'providers',
      };
    case 'configured-no-chat':
      return {
        title: 'No chat-capable connection is enabled',
        description:
          'Connections are configured, but none can run chat yet. Add or enable a model provider in Connections.',
        actionLabel: 'Manage Connections',
        badges: configured.map((provider) =>
          provider.enabled
            ? `Configured: ${connectionTypeLabel(provider.type)}`
            : `Disabled: ${connectionTypeLabel(provider.type)}`,
        ),
        actionTarget: 'providers',
      };
    case 'hidden':
      return {
        title: '',
        description: '',
        actionLabel: '',
        badges: [],
        actionTarget: 'connections',
      };
    default:
      return {
        title: 'No AI connection configured yet',
        description:
          'Start Ollama locally or add a provider connection in Connections. You can configure Bedrock, OpenAI-compatible endpoints, Claude, Codex, or ACP later.',
        actionLabel: 'Manage Connections',
        badges: enabledProviders.map(
          (provider) => `Configured: ${connectionTypeLabel(provider.type)}`,
        ),
        actionTarget: 'providers',
      };
  }
}
