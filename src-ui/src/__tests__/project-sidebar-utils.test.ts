import { describe, expect, test, vi } from 'vitest';
import {
  buildSidebarClassName,
  PROJECT_SIDEBAR_STORAGE_KEY,
  readInitialSidebarCollapsed,
} from '../components/project-sidebar/utils';

describe('project-sidebar utils', () => {
  test('readInitialSidebarCollapsed defaults to collapsed when storage is unset', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(null),
    } as unknown as Storage;

    expect(readInitialSidebarCollapsed(storage)).toBe(true);
    expect(storage.getItem).toHaveBeenCalledWith(PROJECT_SIDEBAR_STORAGE_KEY);
  });

  test('readInitialSidebarCollapsed respects explicit false', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue('false'),
    } as unknown as Storage;

    expect(readInitialSidebarCollapsed(storage)).toBe(false);
  });

  test('buildSidebarClassName handles desktop and mobile states', () => {
    expect(
      buildSidebarClassName({
        isMobile: false,
        mobileOpen: false,
        collapsed: false,
      }),
    ).toBe('sidebar');
    expect(
      buildSidebarClassName({
        isMobile: false,
        mobileOpen: false,
        collapsed: true,
      }),
    ).toBe('sidebar sidebar--collapsed');
    expect(
      buildSidebarClassName({
        isMobile: true,
        mobileOpen: true,
        collapsed: true,
      }),
    ).toBe('sidebar sidebar--expanded');
  });
});
