import { useEffect, useRef } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import type { DockMode } from '../types';

const STORAGE_PREFIX = 'stallion-dock-mode-override:';

/**
 * Layouts call this to declare a preferred dock mode.
 *
 * Priority: URL param (explicit) > sessionStorage override (⌘⇧D / settings) > layout preferred.
 * Layout preferences apply silently — they do NOT write to the URL.
 * Only explicit user actions (⌘⇧D, settings panel) write to URL + sessionStorage.
 */
export function useDockModePreference(layoutKey: string, preferred: DockMode) {
  const { dockMode, setDockMode, setDockModeQuiet } = useNavigation();
  const prevMode = useRef<DockMode>(dockMode);
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    prevMode.current = dockMode;

    // URL param already present → explicit user choice, respect it
    const urlMode = new URLSearchParams(window.location.search).get('dockMode') as DockMode | null;
    if (urlMode) return;

    // SessionStorage override → user previously cycled via ⌘⇧D / settings
    const override = sessionStorage.getItem(STORAGE_PREFIX + layoutKey) as DockMode | null;
    if (override) {
      setDockModeQuiet(override);
      return;
    }

    // Apply layout preference silently (no URL param)
    setDockModeQuiet(preferred);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, preferred, setDockMode, setDockModeQuiet]);

  // Restore previous mode on unmount
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      setDockModeQuiet(prevMode.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setDockModeQuiet]);
}

/** Write a manual override for the current layout (called by ⌘⇧D handler). */
export function setDockModeOverride(layoutKey: string | null, mode: DockMode) {
  if (layoutKey) {
    sessionStorage.setItem(STORAGE_PREFIX + layoutKey, mode);
  }
}
