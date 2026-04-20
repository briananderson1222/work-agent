/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const browseMock = vi.fn();

vi.mock('@stallion-ai/sdk', () => ({
  useFileSystemBrowseQuery: (path?: string, config?: { enabled?: boolean }) =>
    browseMock(path, config),
}));

import { PathAutocomplete } from '../components/PathAutocomplete';

describe('PathAutocomplete', () => {
  beforeEach(() => {
    browseMock.mockReset();
  });

  test('queries the home shortcut path and suggests directories only', () => {
    browseMock.mockReturnValue({
      data: {
        path: '/Users/test',
        entries: [
          { name: 'Documents', isDirectory: true },
          { name: 'Downloads', isDirectory: true },
          { name: 'notes.txt', isDirectory: false },
        ],
      },
    });
    const onChange = vi.fn();

    render(
      <PathAutocomplete
        value="~/Do"
        onChange={onChange}
        apiBase="http://localhost:3000"
      />,
    );

    expect(browseMock).toHaveBeenCalledWith('~', { enabled: true });
    expect(screen.getByText('Documents')).toBeTruthy();
    expect(screen.queryByText(/notes\.txt/)).toBeNull();
  });

  test('tab-completes a single directory and appends a trailing slash', () => {
    browseMock.mockImplementation((path?: string) => {
      if (path === '/tmp/pro') {
        return { data: undefined };
      }
      return {
        data: {
          path: '/tmp',
          entries: [{ name: 'project', isDirectory: true }],
        },
      };
    });
    const onChange = vi.fn();

    render(
      <PathAutocomplete
        value="/tmp/pro"
        onChange={onChange}
        apiBase="http://localhost:3000"
      />,
    );

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab' });

    expect(onChange).toHaveBeenCalledWith('/tmp/project/');
  });

  test('enter accepts the exact typed directory and appends a trailing slash', () => {
    browseMock.mockImplementation((path?: string) => {
      if (path === '/tmp/project') {
        return {
          data: {
            path: '/tmp/project',
            entries: [{ name: 'src', isDirectory: true }],
          },
        };
      }

      return {
        data: {
          path: '/tmp',
          entries: [{ name: 'project', isDirectory: true }],
        },
      };
    });
    const onChange = vi.fn();

    render(
      <PathAutocomplete
        value="/tmp/project"
        onChange={onChange}
        apiBase="http://localhost:3000"
      />,
    );

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('/tmp/project/');
  });

  test('uses ~ prefix in suggestions when user types ~/ even though server returns absolute path', () => {
    browseMock.mockImplementation(() => ({
      data: {
        path: '/Users/test',
        entries: [
          { name: 'Documents', isDirectory: true },
          { name: 'Projects', isDirectory: true },
        ],
      },
    }));

    render(
      <PathAutocomplete
        value="~/"
        onChange={vi.fn()}
        apiBase="http://localhost:3000"
      />,
    );

    expect(browseMock).toHaveBeenCalledWith('~', { enabled: true });

    const docsItem = screen.getByText('Documents').closest('button');
    const projItem = screen.getByText('Projects').closest('button');

    expect(docsItem?.textContent).toContain('~/Documents');
    expect(docsItem?.textContent).not.toContain('/Users/test/Documents');
    expect(projItem?.textContent).toContain('~/Projects');
  });

  test('auto-focuses the input on mount', () => {
    browseMock.mockReturnValue({ data: undefined });

    render(
      <PathAutocomplete
        value="/tmp"
        onChange={vi.fn()}
        apiBase="http://localhost:3000"
      />,
    );

    const input = screen.getByRole('textbox');
    expect(input).toBe(document.activeElement);
  });
});
