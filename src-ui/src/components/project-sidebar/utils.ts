export const PROJECT_SIDEBAR_STORAGE_KEY = 'stallion-sidebar-collapsed';

export function readInitialSidebarCollapsed(storage: Storage): boolean {
  return storage.getItem(PROJECT_SIDEBAR_STORAGE_KEY) !== 'false';
}

export function buildSidebarClassName(options: {
  isMobile: boolean;
  mobileOpen: boolean;
  collapsed: boolean;
}): string {
  const { isMobile, mobileOpen, collapsed } = options;
  if (isMobile) {
    return mobileOpen ? 'sidebar sidebar--expanded' : 'sidebar sidebar--collapsed';
  }
  return collapsed ? 'sidebar sidebar--collapsed' : 'sidebar';
}
