/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../contexts/NavigationContext', () => ({
  useNavigation: () => ({
    navigate: vi.fn(),
  }),
}));

import { SplitPaneLayout } from '../components/SplitPaneLayout';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

describe('SplitPaneLayout', () => {
  test('renders entity-specific list empty copy when provided', () => {
    render(
      <SplitPaneLayout
        label="playbooks"
        title="Playbooks"
        items={[]}
        selectedId={null}
        onSelect={vi.fn()}
        onSearch={vi.fn()}
        listEmptyTitle="No playbooks yet"
        listEmptyDescription="Create a reusable playbook to capture guidance for layouts and agents."
      >
        <div>detail pane</div>
      </SplitPaneLayout>,
    );

    expect(screen.getByText('No playbooks yet')).toBeTruthy();
    expect(
      screen.getByText(
        'Create a reusable playbook to capture guidance for layouts and agents.',
      ),
    ).toBeTruthy();
  });
});
