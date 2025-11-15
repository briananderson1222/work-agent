import { useState, useEffect, useCallback } from 'react';
import { useKeyboardShortcut, useShortcutDisplay } from '../hooks/useKeyboardShortcut';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  useKeyboardShortcut('theme.toggle', 'h', ['cmd'], 'Toggle theme', toggleTheme);
  const shortcut = useShortcutDisplay('theme.toggle');

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode (${shortcut})`}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
