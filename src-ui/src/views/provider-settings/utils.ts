import { connectionTypeLabel } from '../../utils/execution';
import type { ProviderConnection } from './types';

export function capabilitiesForType(
  type: string,
): Array<'llm' | 'embedding' | 'vectordb'> {
  if (type === 'bedrock' || type === 'ollama' || type === 'openai-compat') {
    return ['llm', 'embedding'];
  }
  return ['llm'];
}

export function defaultConfig(type: string): Record<string, unknown> {
  if (type === 'ollama') {
    return { baseUrl: 'http://localhost:11434' };
  }
  if (type === 'openai-compat') {
    return { baseUrl: '', apiKey: '' };
  }
  if (type === 'bedrock') {
    return { region: '' };
  }
  return {};
}

export function filterModelProviders(
  providers: ProviderConnection[],
  search: string,
): ProviderConnection[] {
  const normalizedSearch = search.toLowerCase();
  return providers
    .filter(
      (provider) =>
        provider.capabilities.includes('llm') ||
        provider.capabilities.includes('embedding'),
    )
    .filter(
      (provider) =>
        provider.name.toLowerCase().includes(normalizedSearch) ||
        provider.type.toLowerCase().includes(normalizedSearch),
    );
}

export function describeProvider(provider: ProviderConnection): {
  name: string;
  subtitle: string;
} {
  return {
    name: provider.name || provider.type,
    subtitle:
      provider.capabilities
        .filter((capability) => capability !== 'vectordb')
        .map((capability) => capability.toUpperCase())
        .join(' · ') +
      (provider.type ? ` · ${connectionTypeLabel(provider.type)}` : ''),
  };
}
