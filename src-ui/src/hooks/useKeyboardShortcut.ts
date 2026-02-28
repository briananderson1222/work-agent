import { useEffect } from 'react';
import {
  type KeyboardShortcut,
  useKeyboardShortcuts,
} from '../contexts/KeyboardShortcutsContext';

export function useKeyboardShortcut(
  id: string,
  key: string,
  modifiers: ('cmd' | 'ctrl' | 'shift' | 'alt')[],
  description: string,
  handler: () => void,
  enabled = true,
) {
  const { register } = useKeyboardShortcuts();

  useEffect(() => {
    if (!enabled) return;

    const shortcut: KeyboardShortcut = {
      id,
      key,
      modifiers,
      description,
      handler,
    };
    return register(shortcut);
  }, [id, key, description, handler, enabled, register, modifiers]);
}

export function useShortcutDisplay(id: string): string {
  const { getDisplay } = useKeyboardShortcuts();
  return getDisplay(id);
}

// Re-export for convenience
export { useKeyboardShortcuts } from '../contexts/KeyboardShortcutsContext';
