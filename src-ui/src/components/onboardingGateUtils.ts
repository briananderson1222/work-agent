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
  | 'detected-provider'
  | 'runtime-only'
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

  if (
    status.providers?.configuredChatReady ||
    status.recommendation?.code === 'configured-chat-ready'
  ) {
    return 'hidden';
  }

  if (status.recommendation?.code === 'configured-no-chat') {
    return 'configured-no-chat';
  }

  if (status.recommendation?.code === 'detected-provider') {
    return 'detected-provider';
  }
  if (status.recommendation?.code === 'runtime-only') {
    return 'runtime-only';
  }

  const configured = configuredProviders(status);
  if (
    configured.some((provider) => provider.capabilities.includes('llm')) &&
    configuredLlmProviders(status).length === 0
  ) {
    return 'configured-no-chat';
  }

  const detected = status.providers?.detected;
  if (detected?.ollama || detected?.bedrock) {
    return 'detected-provider';
  }

  return 'unconfigured';
}

export function shouldShowSetupBanner(status: SystemStatus): boolean {
  return setupBannerVariant(status) !== 'hidden';
}

export function buildSetupBannerContent(
  status: SystemStatus,
): SetupBannerContent {
  const configured = configuredProviders(status).filter((provider) =>
    provider.capabilities.includes('llm'),
  );
  const enabledProviders = configuredLlmProviders(status);

  switch (setupBannerVariant(status)) {
    case 'detected-provider': {
      const detectedProviderLabel =
        status.recommendation?.detectedProviderLabel ||
        (status.providers?.detected?.ollama
          ? 'Ollama'
          : status.providers?.detected?.bedrock
            ? 'Amazon Bedrock'
            : 'Provider');
      return {
        title:
          status.recommendation?.title ||
          `${detectedProviderLabel} is available`,
        description:
          status.recommendation?.detail ||
          `Open Connections to review or save a ${detectedProviderLabel} model connection for chat.`,
        actionLabel: 'Review Connections',
        badges: [`Detected: ${detectedProviderLabel}`],
        actionTarget: 'providers',
      };
    }
    case 'configured-no-chat':
      return {
        title: 'No chat-capable connection is enabled',
        description:
          'Connections are configured, but none can run chat yet. Add or enable a chat-capable model connection in Connections.',
        actionLabel: 'Manage Connections',
        badges: configured.map((provider) =>
          provider.enabled
            ? `Configured: ${connectionTypeLabel(provider.type)}`
            : `Disabled: ${connectionTypeLabel(provider.type)}`,
        ),
        actionTarget: 'providers',
      };
    case 'runtime-only':
      return {
        title: 'A runtime is available before chat is configured',
        description:
          'Connected runtimes are detectable, but there is still no explicit chat-capable model connection configured.',
        actionLabel: 'Review Runtimes',
        badges: [],
        actionTarget: 'runtimes',
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
          'Start a local model runtime or add a chat-capable model connection in Connections. You can configure Bedrock, OpenAI-compatible endpoints, Claude, Codex, or ACP later.',
        actionLabel: 'Manage Connections',
        badges: enabledProviders.map(
          (provider) => `Configured: ${connectionTypeLabel(provider.type)}`,
        ),
        actionTarget: 'providers',
      };
  }
}
