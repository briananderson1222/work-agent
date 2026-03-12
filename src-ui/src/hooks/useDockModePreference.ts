import { useEffect, useRef } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import type { DockMode } from '../types';

const STORAGE_PREFIX = 'stallion-dock-mode-override:';

/**
 * Layouts call this to declare a preferred dock mode.
 * SessionStorage overrides persist within a browser session (cleared on tab close).
 * Manual ⌘⇧D cycling writes to sessionStorage so the override sticks.
 */
export function useDockModePreference(layoutKey: string, preferred: DockMode) {
  const { dockMode, setDockMode } = useNavigation();
  const prevMode = useRef<DockMode>(dockMode);

  useEffect(() => {
    prevMode.current = dockMode;
    const override = sessionStorage.getItem(
      STORAGE_PREFIX + layoutKey,
    ) as DockMode | null;
    setDockMode(override || preferred);
    return () => setDockMode(prevMode.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockMode, layoutKey, preferred, setDockMode]);
}

/** Write a manual override for the current layout (called by ⌘⇧D handler). */
export function setDockModeOverride(layoutKey: string | null, mode: DockMode) {
  if (layoutKey) {
    sessionStorage.setItem(STORAGE_PREFIX + layoutKey, mode);
  }
}
