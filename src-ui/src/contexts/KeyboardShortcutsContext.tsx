import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react';

export interface KeyboardShortcut {
  id: string;
  key: string;
  modifiers: ('cmd' | 'ctrl' | 'shift' | 'alt')[];
  description: string;
  handler: () => void;
}

interface KeyboardShortcutsContextType {
  register: (shortcut: KeyboardShortcut) => () => void;
  getDisplay: (id: string) => string;
  getAllShortcuts: () => KeyboardShortcut[];
  isMac: boolean;
}

const KeyboardShortcutsContext = createContext<
  KeyboardShortcutsContextType | undefined
>(undefined);

const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toUpperCase().indexOf('MAC') >= 0;

export function KeyboardShortcutsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const shortcutsRef = useRef(new Map<string, KeyboardShortcut>());

  const register = useCallback((shortcut: KeyboardShortcut) => {
    shortcutsRef.current.set(shortcut.id, shortcut);
    return () => shortcutsRef.current.delete(shortcut.id);
  }, []);

  const getDisplay = useCallback((id: string) => {
    const shortcut = shortcutsRef.current.get(id);
    if (!shortcut) return '';

    const modifierSymbols = shortcut.modifiers.map((mod) => {
      if (mod === 'cmd' || mod === 'ctrl') return isMac ? '⌘' : 'Ctrl+';
      if (mod === 'shift') return isMac ? '⇧' : 'Shift+';
      if (mod === 'alt') return isMac ? '⌥' : 'Alt+';
      return '';
    });

    return modifierSymbols.join('') + shortcut.key.toUpperCase();
  }, []);

  const getAllShortcuts = useCallback(() => {
    return Array.from(shortcutsRef.current.values());
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcutsRef.current.values()) {
        const hasCmd =
          shortcut.modifiers.includes('cmd') ||
          shortcut.modifiers.includes('ctrl');
        const hasShift = shortcut.modifiers.includes('shift');
        const hasAlt = shortcut.modifiers.includes('alt');

        const cmdMatch = !hasCmd || e.metaKey || e.ctrlKey;
        const shiftMatch = hasShift === e.shiftKey;
        const altMatch = hasAlt === e.altKey;
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

        if (cmdMatch && shiftMatch && altMatch && keyMatch) {
          e.preventDefault();
          shortcut.handler();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <KeyboardShortcutsContext.Provider
      value={{ register, getDisplay, getAllShortcuts, isMac }}
    >
      {children}
    </KeyboardShortcutsContext.Provider>
  );
}

export function useKeyboardShortcuts() {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error(
      'useKeyboardShortcuts must be used within KeyboardShortcutsProvider',
    );
  }
  return context;
}
