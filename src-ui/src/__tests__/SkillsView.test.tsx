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

vi.mock('@stallion-ai/sdk', () => ({
  useCreateLocalSkillMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  }),
  useInstallSkillMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useRegistrySkillsQuery: () => ({ data: [], isLoading: false }),
  useSkillContentQuery: () => ({ data: undefined }),
  useSkillQuery: () => ({ data: undefined }),
  useSkillsQuery: () => ({ data: [] }),
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
});
