/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const selectionState = {
  selectedId: null as string | null,
  select: vi.fn(),
  deselect: vi.fn(),
};

let localSkillsMock: any[] = [];
let registrySkillsMock: any[] = [];
let editableSkillMock: any;
const convertSkillToPlaybookMutateMock = vi.fn();

vi.mock('@stallion-ai/sdk', () => ({
  useConvertSkillToPlaybookMutation: () => ({
    isPending: false,
    mutate: convertSkillToPlaybookMutateMock,
  }),
  useCreateLocalSkillMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  }),
  useInstallSkillMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useRegistrySkillsQuery: () => ({
    data: registrySkillsMock,
    isLoading: false,
  }),
  useSkillContentQuery: () => ({ data: undefined }),
  useSkillQuery: () => ({ data: editableSkillMock }),
  useSkillsQuery: () => ({ data: localSkillsMock }),
  useUninstallSkillMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useUpdateLocalSkillMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  }),
  useUpdateSkillMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));

const navigateMock = vi.fn();
const showToastMock = vi.fn();

vi.mock('../contexts/NavigationContext', () => ({
  useNavigation: () => ({ navigate: navigateMock }),
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock('../hooks/useUrlSelection', () => ({
  useUrlSelection: () => selectionState,
}));

import { SkillsView } from '../views/SkillsView';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

afterEach(() => {
  selectionState.selectedId = null;
  selectionState.select.mockReset();
  selectionState.deselect.mockReset();
  navigateMock.mockReset();
  showToastMock.mockReset();
  convertSkillToPlaybookMutateMock.mockReset();
  localSkillsMock = [];
  registrySkillsMock = [];
  editableSkillMock = undefined;
});

describe('SkillsView', () => {
  test('renders the create form when the URL selection is /skills/new', () => {
    selectionState.selectedId = 'new';

    render(<SkillsView />);

    expect(screen.getByText('New Skill')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
    expect(screen.queryByText('No skill selected')).toBeNull();
  });

  test('opens the create form when the add button is clicked', () => {
    render(<SkillsView />);

    fireEvent.click(screen.getByRole('button', { name: '+ New Skill' }));

    expect(selectionState.select).toHaveBeenCalledWith('new');
    expect(screen.getByText('New Skill')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
  });

  test('lists only installed local skills on /skills', () => {
    localSkillsMock = [
      {
        name: 'installed-skill',
        description: 'Installed locally',
        version: '1.0.0',
        source: 'local',
      },
    ];
    registrySkillsMock = [
      {
        id: 'registry-only-skill',
        displayName: 'Registry Only Skill',
        description: 'Should not appear on /skills',
        version: '9.9.9',
      },
    ];

    render(<SkillsView />);

    expect(screen.getByText('installed-skill')).toBeTruthy();
    expect(screen.queryByText('Registry Only Skill')).toBeNull();
  });

  test('renders guidance tabs for switching between playbooks and skills', () => {
    render(<SkillsView />);

    expect(screen.getByRole('button', { name: 'Playbooks' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skills' })).toBeTruthy();
  });

  test('opens skill to playbook conversion review for editable skills', () => {
    selectionState.selectedId = 'installed-skill';
    localSkillsMock = [
      {
        name: 'installed-skill',
        description: 'Installed locally',
        source: 'local',
      },
    ];
    editableSkillMock = {
      name: 'installed-skill',
      body: 'Do things',
      description: 'Installed locally',
      source: 'local',
    };

    render(<SkillsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Playbook' }));

    expect(screen.getByText('Create Playbook From Skill')).toBeTruthy();
    expect(
      screen.getAllByDisplayValue('installed-skill').length,
    ).toBeGreaterThan(1);
  });

  test('opens skill to playbook conversion review for installed registry skills', () => {
    selectionState.selectedId = 'registry-skill';
    localSkillsMock = [
      {
        name: 'registry-skill',
        description: 'Installed from registry',
        source: 'registry',
      },
    ];
    editableSkillMock = {
      name: 'registry-skill',
      body: 'Use the registry skill',
      description: 'Installed from registry',
      source: 'registry',
    };

    render(<SkillsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Playbook' }));

    expect(screen.getByText('Create Playbook From Skill')).toBeTruthy();
    expect(
      screen.getAllByDisplayValue('registry-skill').length,
    ).toBeGreaterThan(1);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
