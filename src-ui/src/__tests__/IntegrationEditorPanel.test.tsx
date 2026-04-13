/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { IntegrationEditorPanel } from '../views/integrations/IntegrationEditorPanel';

describe('IntegrationEditorPanel', () => {
  test('uses shared section rhythm for the form editor pane', () => {
    const { container } = render(
      <IntegrationEditorPanel
        editForm={{
          id: 'demo-server',
          displayName: 'Demo Server',
          description: 'Test server',
          kind: 'mcp',
          transport: 'stdio',
          command: 'npx',
          args: ['-y', 'demo-server'],
          env: { API_KEY: 'secret' },
          connected: false,
        }}
        isNew={false}
        locked={false}
        message={{ type: 'success', text: 'Saved' }}
        viewMode="form"
        rawJson=""
        rawError={null}
        savePending={false}
        reconnectPending={false}
        onReconnect={vi.fn()}
        onDelete={vi.fn()}
        onSave={vi.fn()}
        onSwitchToForm={vi.fn()}
        onSwitchToRaw={vi.fn()}
        onRawJsonChange={vi.fn()}
        onUpdate={vi.fn()}
        onUnlock={vi.fn()}
      />,
    );

    expect(screen.getByText('Editor Mode')).toBeTruthy();
    expect(screen.getByText('Basics')).toBeTruthy();
    expect(screen.getByText('Connection')).toBeTruthy();
    expect(screen.getByText('Environment Variables')).toBeTruthy();
    expect(container.querySelectorAll('.agent-editor__section')).toHaveLength(
      4,
    );
  });

  test('shows the raw editor section when switched to raw mode', () => {
    const onSwitchToRaw = vi.fn();

    render(
      <IntegrationEditorPanel
        editForm={{
          id: 'demo-server',
          displayName: 'Demo Server',
          description: 'Test server',
          kind: 'mcp',
          transport: 'stdio',
          command: 'npx',
          args: [],
          env: {},
          connected: true,
        }}
        isNew={false}
        locked={false}
        message={null}
        viewMode="raw"
        rawJson='{"mcpServers":{}}'
        rawError={null}
        savePending={false}
        reconnectPending={false}
        onReconnect={vi.fn()}
        onDelete={vi.fn()}
        onSave={vi.fn()}
        onSwitchToForm={vi.fn()}
        onSwitchToRaw={onSwitchToRaw}
        onRawJsonChange={vi.fn()}
        onUpdate={vi.fn()}
        onUnlock={vi.fn()}
      />,
    );

    expect(screen.getByText('Raw Configuration')).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      '{"mcpServers":{}}',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Raw JSON' }));
    expect(onSwitchToRaw).toHaveBeenCalled();
  });
});
