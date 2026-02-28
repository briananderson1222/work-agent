import { useEffect } from 'react';

/**
 * Hook to handle keyboard shortcuts for tab navigation
 * Supports ⌘1-9 for direct tab access and ⌘[ / ⌘] for prev/next
 */
export function useTabKeyboardShortcuts<T extends string>(
  tabs: readonly T[],
  currentTab: T,
  setTab: (tab: T) => void,
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      const currentIndex = tabs.indexOf(currentTab);

      // Direct tab access (⌘1-9)
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key, 10) - 1;
        if (tabs[index]) {
          e.preventDefault();
          setTab(tabs[index]);
        }
      }
      // Previous tab (⌘[)
      else if (e.key === '[' && currentIndex > 0) {
        e.preventDefault();
        setTab(tabs[currentIndex - 1]);
      }
      // Next tab (⌘])
      else if (e.key === ']' && currentIndex < tabs.length - 1) {
        e.preventDefault();
        setTab(tabs[currentIndex + 1]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, currentTab, setTab]);
}
