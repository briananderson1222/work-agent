/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const installedByTab = {
  agents: new Set<string>(),
  integrations: new Set<string>(),
  plugins: new Set<string>(),
  skills: new Set<string>(),
};
const mutationCalls: Array<{
  action: 'install' | 'uninstall';
  id: string;
  tab: 'agents' | 'integrations' | 'plugins' | 'skills';
}> = [];

const registryItems = {
  agents: [
    {
      id: 'agent-one',
      displayName: 'Agent One',
      description: 'Primary agent',
      version: '1.0.0',
    },
    {
      id: 'agent-two',
      displayName: 'Agent Two',
      description: 'Backup agent',
    },
  ],
  integrations: [
    {
      id: 'integration-one',
      displayName: 'Integration One',
      description: 'Registry integration',
      source: 'AIM',
    },
  ],
  plugins: [
    {
      id: 'demo-layout',
      displayName: 'Demo Layout',
      description: 'Starter plugin',
      source: '../demo-layout',
      version: '1.0.0',
    },
  ],
  skills: [
    {
      id: 'skill-one',
      displayName: 'Skill One',
      description: 'Registry skill',
      source: 'GitHub',
    },
  ],
} as const;

function makeMutation(tab: 'agents' | 'integrations' | 'plugins' | 'skills') {
  return {
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
      mutationCalls.push({ tab, ...variables });
      if (variables.action === 'install') {
        installedByTab[tab].add(variables.id);
      } else {
        installedByTab[tab].delete(variables.id);
      }
      callbacks?.onSuccess?.({
        success: true,
        action: variables.action,
      });
    },
    variables: null,
  };
}

vi.mock('@stallion-ai/sdk', () => ({
  useInstalledRegistryItemsQuery: (tab: string) => ({
    data: registryItems[tab as keyof typeof registryItems].filter((item) =>
      installedByTab[tab as keyof typeof installedByTab].has(item.id),
    ),
    isLoading: false,
  }),
  useRegistryAgentActionMutation: () => makeMutation('agents'),
  useRegistryIntegrationActionMutation: () => makeMutation('integrations'),
  usePluginRegistryInstallMutation: () => makeMutation('plugins'),
  useRegistryItemsQuery: (tab: string) => ({
    data: registryItems[tab as keyof typeof registryItems].map((item) => ({
      ...item,
      installed: installedByTab[tab as keyof typeof installedByTab].has(
        item.id,
      ),
    })),
    isLoading: false,
  }),
  useRegistrySkillActionMutation: () => makeMutation('skills'),
}));

const navigateMock = vi.fn();

vi.mock('../contexts/NavigationContext', () => ({
  useNavigation: () => ({
    navigate: navigateMock,
  }),
}));

import { RegistryView } from '../views/RegistryView';

afterEach(() => {
  for (const installedItems of Object.values(installedByTab)) {
    installedItems.clear();
  }
  mutationCalls.length = 0;
  navigateMock.mockReset();
});

describe('RegistryView', () => {
  test('uses selected-card preview actions for agents without mutating on card click', () => {
    const { rerender } = render(<RegistryView />);

    fireEvent.click(screen.getByRole('button', { name: /Agent Two/i }));

    expect(mutationCalls).toEqual([]);
    const detail = screen.getByTestId('registry-detail');
    expect(within(detail).getByText('Selected agent')).toBeTruthy();
    expect(
      within(detail).getByRole('button', { name: 'Install' }),
    ).toBeTruthy();

    fireEvent.click(within(detail).getByRole('button', { name: 'Install' }));

    expect(mutationCalls).toEqual([
      { id: 'agent-two', action: 'install', tab: 'agents' },
    ]);
    expect(screen.getByText('Installed Agent Two')).toBeTruthy();

    rerender(<RegistryView />);
    const installedDetail = screen.getByTestId('registry-detail');
    expect(
      within(installedDetail).getByRole('button', { name: 'Remove' }),
    ).toBeTruthy();

    fireEvent.click(
      within(installedDetail).getByRole('button', { name: 'Remove' }),
    );

    expect(mutationCalls).toEqual([
      { id: 'agent-two', action: 'install', tab: 'agents' },
      { id: 'agent-two', action: 'uninstall', tab: 'agents' },
    ]);
    expect(screen.getByText('Removed Agent Two')).toBeTruthy();
  });

  test.each([
    ['Skills', 'skills', 'skill-one', 'Skill One', 'GitHub'],
    ['Integrations', 'integrations', 'integration-one', 'Integration One'],
    ['Plugins', 'plugins', 'demo-layout', 'Demo Layout'],
  ] as const)('renders preview install/remove actions for %s', (tabLabel, tabKey, itemId, itemLabel, sourceLabel) => {
    const { rerender } = render(<RegistryView />);

    fireEvent.click(screen.getByRole('button', { name: tabLabel }));
    const detail = screen.getByTestId('registry-detail');
    expect(
      within(detail).getByText(`Selected ${tabKey.slice(0, -1)}`),
    ).toBeTruthy();
    if (sourceLabel) {
      expect(within(detail).getAllByText(sourceLabel).length).toBeGreaterThan(
        0,
      );
    }

    const card = screen.getByRole('button', { name: new RegExp(itemLabel) });
    const cardInstallButton = card.querySelector(
      '.page__btn-secondary',
    ) as HTMLButtonElement | null;
    expect(cardInstallButton?.textContent).toMatch(/Install/);
    fireEvent.click(cardInstallButton!);

    expect(mutationCalls).toContainEqual({
      id: itemId,
      action: 'install',
      tab: tabKey,
    });
    expect(screen.getByText(`Installed ${itemLabel}`)).toBeTruthy();

    rerender(<RegistryView />);
    expect(
      within(screen.getByTestId('registry-detail')).getByRole('button', {
        name: /Remove/,
      }),
    ).toBeTruthy();
  });

  test('offers a route to installed skill management from the skills tab', () => {
    render(<RegistryView />);

    fireEvent.click(screen.getByRole('button', { name: 'Skills' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Manage Installed Skills' }),
    );

    expect(navigateMock).toHaveBeenCalledWith('/skills');
  });
});
