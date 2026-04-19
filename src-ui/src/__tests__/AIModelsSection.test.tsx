/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

let runtimeConnectionsMock: Array<{ id: string; name: string }> = [];

vi.mock('@stallion-ai/sdk', () => ({
  useRuntimeConnectionsQuery: () => ({
    data: runtimeConnectionsMock,
  }),
}));

vi.mock('../components/ModelSelector', () => ({
  ModelSelector: ({
    value,
    placeholder,
  }: {
    value: string;
    placeholder?: string;
  }) => (
    <input
      aria-label="Default Model"
      defaultValue={value}
      placeholder={placeholder}
      readOnly
    />
  ),
}));

vi.mock('../utils/execution', () => ({
  preferredChatRuntime: (connections: Array<{ id: string; name: string }>) =>
    connections[0] ?? null,
  runtimeCatalogVisibleModels: (
    runtime: { id: string; name: string } | null,
  ) =>
    runtime
      ? [
          {
            id: 'runtime-model',
            name: 'Runtime Model',
            originalId: 'runtime-model',
          },
        ]
      : [],
}));

import { AIModelsSection } from '../views/settings/AIModelsSection';

describe('AIModelsSection', () => {
  test('uses generic default-model hint when no runtime-backed options are available', () => {
    runtimeConnectionsMock = [];

    render(
      <AIModelsSection
        config={{ defaultModel: '' }}
        validationErrors={{}}
        validationWarnings={{}}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "Default model for new chats and agents that don't specify one.",
      ),
    ).toBeTruthy();
  });

  test('mentions the preferred runtime when runtime-backed model options are available', () => {
    runtimeConnectionsMock = [{ id: 'codex', name: 'Codex Runtime' }];

    render(
      <AIModelsSection
        config={{ defaultModel: '' }}
        validationErrors={{}}
        validationWarnings={{}}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "Default model for new chats and agents that don't specify one. Options currently come from Codex Runtime.",
      ),
    ).toBeTruthy();
  });
});
