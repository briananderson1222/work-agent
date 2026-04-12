/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@stallion-ai/sdk', () => ({
  useConnectionsQuery: () => ({
    data: [
      {
        id: 'bedrock-default',
        kind: 'model',
        type: 'bedrock',
        name: 'Amazon Bedrock',
        enabled: true,
        status: 'missing_prerequisites',
        capabilities: ['llm'],
        config: {},
        prerequisites: [],
      },
      {
        id: 'codex-runtime',
        kind: 'runtime',
        type: 'codex-runtime',
        name: 'Codex Runtime',
        enabled: true,
        status: 'degraded',
        capabilities: ['agent-runtime'],
        config: {},
        runtimeCatalog: {
          source: 'fallback',
          reason: 'Live runtime catalog is unavailable.',
          models: [],
          fallbackModels: [],
        },
        prerequisites: [],
      },
    ],
  }),
  useIntegrationsQuery: () => ({ data: [] }),
  useGlobalKnowledgeStatusQuery: () => ({ data: null }),
  useSystemStatusQuery: () => ({
    data: {
      recommendation: {
        type: 'providers',
        actionLabel: 'Review model connections',
        title: 'Detected setup help',
        detail: 'Open connections to finish setup.',
      },
      capabilities: {
        chat: { ready: false, source: null },
      },
    },
  }),
}));

vi.mock('../contexts/NavigationContext', () => ({
  useNavigation: () => ({
    navigate: vi.fn(),
  }),
}));

import { ConnectionsHub } from '../views/ConnectionsHub';

describe('ConnectionsHub', () => {
  test('shows effective model connection status instead of a raw enabled badge', () => {
    render(<ConnectionsHub />);

    expect(screen.getByText('Setup required')).toBeTruthy();
    expect(screen.queryByText('Enabled')).toBeNull();
    expect(screen.getByText('Catalog: Fallback')).toBeTruthy();
  });
});
