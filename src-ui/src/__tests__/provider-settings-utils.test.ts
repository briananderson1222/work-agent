import { describe, expect, test } from 'vitest';
import type { ProviderConnection } from '../views/provider-settings/types';
import {
  capabilitiesForType,
  defaultConfig,
  describeProvider,
  filterModelProviders,
} from '../views/provider-settings/utils';

const providers: ProviderConnection[] = [
  {
    id: 'bedrock',
    kind: 'model',
    type: 'bedrock',
    name: 'AWS Bedrock',
    config: {},
    enabled: true,
    capabilities: ['llm', 'embedding'],
    status: 'ready',
    prerequisites: [],
    lastCheckedAt: null,
  },
  {
    id: 'vector-only',
    kind: 'model',
    type: 'custom',
    name: 'Vector Only',
    config: {},
    enabled: true,
    capabilities: ['vectordb'],
    status: 'ready',
    prerequisites: [],
    lastCheckedAt: null,
  },
];

describe('provider-settings utils', () => {
  test('capabilitiesForType and defaultConfig reflect provider defaults', () => {
    expect(capabilitiesForType('bedrock')).toEqual(['llm', 'embedding']);
    expect(capabilitiesForType('custom')).toEqual(['llm']);
    expect(defaultConfig('ollama')).toEqual({
      baseUrl: 'http://localhost:11434',
    });
  });

  test('filterModelProviders excludes vectordb-only entries and respects search', () => {
    expect(filterModelProviders(providers, '')).toHaveLength(1);
    expect(filterModelProviders(providers, 'aws')[0]?.id).toBe('bedrock');
  });

  test('describeProvider formats a sidebar label', () => {
    expect(describeProvider(providers[0])).toEqual({
      name: 'AWS Bedrock',
      subtitle: 'LLM · EMBEDDING · Amazon Bedrock',
    });
  });
});
