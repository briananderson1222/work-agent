import { useEffect } from 'react';
import { useKeyboardShortcuts, KeyboardShortcut } from '../contexts/KeyboardShortcutsContext';

export function useKeyboardShortcut(
  id: string,
  key: string,
  modifiers: ('cmd' | 'ctrl' | 'shift' | 'alt')[],
  description: string,
  handler: () => void,
  enabled = true
) {
  const { register } = useKeyboardShortcuts();

  useEffect(() => {
    if (!enabled) return;
    
    const shortcut: KeyboardShortcut = { id, key, modifiers, description, handler };
    return register(shortcut);
  }, [id, key, modifiers.join(','), description, handler, enabled, register]);
}

export function useShortcutDisplay(id: string): string {
  const { getDisplay } = useKeyboardShortcuts();
  return getDisplay(id);
}

// Re-export for convenience
export { useKeyboardShortcuts } from '../contexts/KeyboardShortcutsContext';
