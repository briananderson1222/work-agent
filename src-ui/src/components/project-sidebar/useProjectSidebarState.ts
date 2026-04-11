import { useEffect, useState } from 'react';
import {
  PROJECT_SIDEBAR_STORAGE_KEY,
  readInitialSidebarCollapsed,
} from './utils';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 768px)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

export function useProjectSidebarState() {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(() =>
    readInitialSidebarCollapsed(localStorage),
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setMobileOpen((prev) => !prev);
    window.addEventListener('toggle-sidebar', handler);
    return () => window.removeEventListener('toggle-sidebar', handler);
  }, []);

  const effectiveCollapsed = isMobile ? !mobileOpen : collapsed;

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(PROJECT_SIDEBAR_STORAGE_KEY, String(next));
  };

  return {
    collapsed,
    effectiveCollapsed,
    isMobile,
    mobileOpen,
    setMobileOpen,
    toggleCollapse,
  };
}
