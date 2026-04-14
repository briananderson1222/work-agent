/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { AgentEditorBasicTab } from '../views/agent-editor/AgentEditorBasicTab';
import type { AgentFormData } from '../views/agent-editor/types';

let runtimeConnections = [
  {
    id: 'managed-runtime',
    kind: 'runtime',
    type: 'managed-runtime',
    name: 'Managed Runtime',
    enabled: true,
    capabilities: ['agent-runtime'],
    config: { executionClass: 'managed' },
  },
  {
    id: 'codex-runtime',
    kind: 'runtime',
    type: 'codex-runtime',
    name: 'Codex Runtime',
    enabled: true,
    capabilities: ['agent-runtime'],
    config: { executionClass: 'connected' },
  },
];

vi.mock('@stallion-ai/sdk', () => ({
  useRuntimeConnectionsQuery: () => ({
    data: runtimeConnections,
  }),
}));

vi.mock('../components/AgentIcon', () => ({
  AgentIcon: () => <div>icon</div>,
}));

vi.mock('../components/ModelSelector', () => ({
  ModelSelector: () => <div>model-selector</div>,
}));

function createForm(): AgentFormData {
  return {
    slug: 'agent-one',
    name: 'Agent One',
    description: '',
    prompt: 'You are helpful.',
    modelId: '',
    region: '',
    guardrails: null,
    maxSteps: '',
    tools: { mcpServers: [], available: [], autoApprove: [] },
    execution: {
      runtimeConnectionId: 'managed-runtime',
      modelConnectionId: 'bedrock-default',
      runtimeOptions: { legacy: true },
    },
    icon: '',
    skills: [],
    prompts: [],
  };
}

describe('AgentEditorBasicTab', () => {
  test('switches new agents to the preferred connected runtime', () => {
    runtimeConnections = [
      {
        id: 'managed-runtime',
        kind: 'runtime',
        type: 'managed-runtime',
        name: 'Managed Runtime',
        enabled: true,
        capabilities: ['agent-runtime'],
        config: { executionClass: 'managed' },
      },
      {
        id: 'codex-runtime',
        kind: 'runtime',
        type: 'codex-runtime',
        name: 'Codex Runtime',
        enabled: true,
        capabilities: ['agent-runtime'],
        config: { executionClass: 'connected' },
      },
    ];
    const setForm = vi.fn();

    render(
      <AgentEditorBasicTab
        form={createForm()}
        setForm={setForm}
        isCreating
        locked={false}
        validationErrors={{}}
        appConfig={{}}
        enrich={vi.fn()}
        isEnriching={false}
        agentType="managed"
      />,
    );

    fireEvent.change(screen.getByLabelText('Agent Type'), {
      target: { value: 'connected' },
    });

    const update = setForm.mock.calls[0]?.[0];
    expect(update).toBeTypeOf('function');

    const next = update(createForm());
    expect(next.execution).toEqual({
      runtimeConnectionId: 'codex-runtime',
      modelConnectionId: '',
      runtimeOptions: {},
    });
  });

  test('disables the connected agent option when no connected runtime exists', () => {
    runtimeConnections = [
      {
        id: 'managed-runtime',
        kind: 'runtime',
        type: 'managed-runtime',
        name: 'Managed Runtime',
        enabled: true,
        capabilities: ['agent-runtime'],
        config: { executionClass: 'managed' },
      },
    ];

    render(
      <AgentEditorBasicTab
        form={createForm()}
        setForm={vi.fn()}
        isCreating
        locked={false}
        validationErrors={{}}
        appConfig={{}}
        enrich={vi.fn()}
        isEnriching={false}
        agentType="managed"
      />,
    );

    expect(
      screen.getByText(
        /Add a connected runtime in Connections before switching this agent\./,
      ),
    ).toBeTruthy();
  });
});
