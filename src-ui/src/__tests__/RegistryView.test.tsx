/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

let installed = false;
const mutationCalls: Array<{ id: string; action: 'install' | 'uninstall' }> =
  [];

vi.mock('@stallion-ai/sdk', () => ({
  useInstalledRegistryItemsQuery: (tab: string) => ({
    data:
      tab === 'plugins' && installed
        ? [
            {
              id: 'demo-layout',
              displayName: 'Demo Layout',
            },
          ]
        : [],
    isLoading: false,
  }),
  usePluginRegistryInstallMutation: () => ({
    isPending: false,
    mutate: (
      variables: { id: string; action: 'install' | 'uninstall' },
      callbacks?: {
        onSuccess?: (result: {
          success: boolean;
          action: 'install' | 'uninstall';
        }) => void;
      },
    ) => {
      mutationCalls.push(variables);
      installed = variables.action === 'install';
      callbacks?.onSuccess?.({
        success: true,
        action: variables.action,
      });
    },
    variables: null,
  }),
  useRegistryItemsQuery: (tab: string) => ({
    data:
      tab === 'plugins'
        ? [
            {
              id: 'demo-layout',
              displayName: 'Demo Layout',
              description: 'Starter plugin',
              installed,
              source: '../demo-layout',
              version: '1.0.0',
            },
          ]
        : [],
    isLoading: false,
  }),
}));

import { RegistryView } from '../views/RegistryView';

afterEach(() => {
  installed = false;
  mutationCalls.length = 0;
});

describe('RegistryView', () => {
  test('installs and removes registry plugins from the plugins tab', () => {
    const { rerender } = render(<RegistryView />);

    fireEvent.click(screen.getByRole('button', { name: 'Plugins' }));
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));

    expect(mutationCalls).toEqual([{ id: 'demo-layout', action: 'install' }]);
    expect(screen.getByText('Installed Demo Layout')).toBeTruthy();

    rerender(<RegistryView />);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(mutationCalls).toEqual([
      { id: 'demo-layout', action: 'install' },
      { id: 'demo-layout', action: 'uninstall' },
    ]);
    expect(screen.getByText('Removed Demo Layout')).toBeTruthy();
  });
});
