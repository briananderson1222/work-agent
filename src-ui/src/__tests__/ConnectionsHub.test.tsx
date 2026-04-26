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
      {
        id: 'lancedb-builtin',
        kind: 'model',
        type: 'lancedb',
        name: 'Stallion Built-In',
        enabled: true,
        status: 'ready',
        capabilities: ['vectordb'],
        config: {},
        prerequisites: [],
      },
    ],
  }),
  useIntegrationsQuery: () => ({ data: [] }),
  useGlobalKnowledgeStatusQuery: () => ({
    data: {
      vectorDb: {
        id: 'lancedb-builtin',
        name: 'Stallion Built-In',
        type: 'lancedb',
        enabled: true,
      },
      embedding: null,
      stats: { totalDocuments: 0, totalChunks: 0, projectCount: 0 },
    },
  }),
  useSystemStatusQuery: () => ({
    data: {
      recommendation: {
        code: 'detected-provider',
        type: 'providers',
        actionLabel: 'Review model connections',
        title: 'Detected setup help',
        detail: 'Open connections to finish setup.',
        detectedProviderType: 'bedrock',
        detectedProviderLabel: 'Amazon Bedrock',
      },
      capabilities: {
        chat: { ready: false, source: null },
      },
    },
  }),
  useACPConnectionRegistryQuery: () => ({
    data: [
      {
        id: 'kiro',
        name: 'Kiro CLI',
        command: 'kiro',
        args: ['--acp'],
        description: 'Connect Kiro through ACP',
        installed: false,
      },
    ],
  }),
  useACPConnectionsQuery: () => ({
    data: [],
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

  test('shows built-in vectordb only in the knowledge section', () => {
    const { container } = render(<ConnectionsHub />);
    const sections = Array.from(
      container.querySelectorAll('.connections-hub__section'),
    );
    const modelSection = sections.find((section) =>
      section.textContent?.includes('Model Connections'),
    );
    const knowledgeSection = sections.find((section) =>
      section.textContent?.includes('Knowledge'),
    );

    expect(modelSection?.textContent).not.toContain('Stallion Built-In');
    expect(knowledgeSection?.textContent).toContain('Stallion Built-In');
    expect(screen.queryByText('+ Add a model connection')).toBeNull();
  });

  test('surfaces ACP registry entries from the main connections hub', () => {
    render(<ConnectionsHub />);

    expect(screen.getByText('ACP Connections')).toBeTruthy();
    expect(screen.getByText('Kiro CLI')).toBeTruthy();
    expect(screen.getByText('kiro --acp')).toBeTruthy();
  });
});
