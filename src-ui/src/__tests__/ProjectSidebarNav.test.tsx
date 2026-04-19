/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { ProjectSidebarNav } from '../components/project-sidebar/ProjectSidebarNav';

describe('ProjectSidebarNav', () => {
  test('renders the primary management surfaces in the expected order', () => {
    window.history.pushState({}, '', '/registry');
    const navigate = vi.fn();

    render(
      <ProjectSidebarNav
        collapsed={false}
        isMobile={false}
        navigate={navigate}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Agents',
      'Playbooks',
      'Registry',
      'Connections',
      'Plugins',
      'Schedule',
      'Monitoring',
    ]);
    expect(buttons[2].className).toContain('sidebar__nav-btn--active');

    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    expect(navigate).toHaveBeenCalledWith('/agents');
  });
});
