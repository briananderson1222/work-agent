/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useChatDockState } from '../hooks/useChatDockState';

vi.mock('../contexts/NavigationContext', () => ({
  useNavigation: () => ({ dockMode: 'bottom' }),
}));

const HEADER_HEIGHT = 38;
const TOOLBAR_HEIGHT = 46;

const defaultOptions = {
  defaultFontSize: 14,
  isDockOpen: true,
  isDockMaximized: false,
};

describe('useChatDockState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (prop: string) => {
        if (prop === '--chat-dock-header-height') return String(HEADER_HEIGHT);
        if (prop === '--app-toolbar-height') return String(TOOLBAR_HEIGHT);
        return '';
      },
    } as unknown as CSSStyleDeclaration);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('default state', () => {
    test('dock height defaults to 320', () => {
      const { result } = renderHook(() => useChatDockState(defaultOptions));
      expect(result.current.dockHeight).toBe(320);
      expect(result.current.previousDockHeight).toBe(320);
    });

    test('autoHideEnabled defaults to false when localStorage is empty', () => {
      const { result } = renderHook(() => useChatDockState(defaultOptions));
      expect(result.current.autoHideEnabled).toBe(false);
    });

    test('isAutoHidden starts false', () => {
      const { result } = renderHook(() => useChatDockState(defaultOptions));
      expect(result.current.isAutoHidden).toBe(false);
    });
  });

  describe('localStorage persistence', () => {
    test('restores autoHideEnabled=true from localStorage on mount', () => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) =>
          key === 'chatDockAutoHide' ? 'true' : null,
        ),
        setItem: vi.fn(),
      });
      const { result } = renderHook(() => useChatDockState(defaultOptions));
      expect(result.current.autoHideEnabled).toBe(true);
    });

    test('persists autoHideEnabled=true to localStorage when enabled', () => {
      const setItem = vi.fn();
      vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem });
      const { result } = renderHook(() => useChatDockState(defaultOptions));
      act(() => {
        result.current.setAutoHideEnabled(true);
      });
      expect(setItem).toHaveBeenCalledWith('chatDockAutoHide', 'true');
    });

    test('persists autoHideEnabled=false to localStorage when disabled', () => {
      const setItem = vi.fn();
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) =>
          key === 'chatDockAutoHide' ? 'true' : null,
        ),
        setItem,
      });
      const { result } = renderHook(() => useChatDockState(defaultOptions));
      act(() => {
        result.current.setAutoHideEnabled(false);
      });
      expect(setItem).toHaveBeenCalledWith('chatDockAutoHide', 'false');
    });
  });

  describe('auto-hide timer', () => {
    test('fires after 5 seconds and sets isAutoHidden', () => {
      const { result } = renderHook(() => useChatDockState(defaultOptions));
      act(() => {
        result.current.setAutoHideEnabled(true);
      });
      expect(result.current.isAutoHidden).toBe(false);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.isAutoHidden).toBe(true);
    });

    test('does not fire before 5 seconds', () => {
      const { result } = renderHook(() => useChatDockState(defaultOptions));
      act(() => {
        result.current.setAutoHideEnabled(true);
      });
      act(() => {
        vi.advanceTimersByTime(4999);
      });
      expect(result.current.isAutoHidden).toBe(false);
    });

    test('does not fire when activeSessionCount > 0', () => {
      const { result } = renderHook(() =>
        useChatDockState({ ...defaultOptions, activeSessionCount: 1 }),
      );
      act(() => {
        result.current.setAutoHideEnabled(true);
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.isAutoHidden).toBe(false);
    });

    test('does not fire when isDockMaximized', () => {
      const { result } = renderHook(() =>
        useChatDockState({ ...defaultOptions, isDockMaximized: true }),
      );
      act(() => {
        result.current.setAutoHideEnabled(true);
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.isAutoHidden).toBe(false);
    });

    test('does not fire when dock is closed', () => {
      const { result } = renderHook(() =>
        useChatDockState({ ...defaultOptions, isDockOpen: false }),
      );
      act(() => {
        result.current.setAutoHideEnabled(true);
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.isAutoHidden).toBe(false);
    });

    test('does not fire when autoHide is disabled', () => {
      const { result } = renderHook(() => useChatDockState(defaultOptions));
      // autoHideEnabled stays false — timer should never start
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(result.current.isAutoHidden).toBe(false);
    });
  });

  describe('resetAutoHide', () => {
    test('clears isAutoHidden and restarts the timer', () => {
      const { result } = renderHook(() => useChatDockState(defaultOptions));
      act(() => {
        result.current.setAutoHideEnabled(true);
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.isAutoHidden).toBe(true);

      act(() => {
        result.current.resetAutoHide();
      });
      expect(result.current.isAutoHidden).toBe(false);

      // Timer restarted — should fire again after another 5s
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.isAutoHidden).toBe(true);
    });

    test('is a no-op when autoHide is disabled', () => {
      const { result } = renderHook(() => useChatDockState(defaultOptions));
      expect(result.current.autoHideEnabled).toBe(false);
      act(() => {
        result.current.resetAutoHide();
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.isAutoHidden).toBe(false);
    });
  });

  describe('CSS variable updates', () => {
    test('sets --chat-dock-height to header height when auto-hidden', () => {
      const setProperty = vi.spyOn(
        document.documentElement.style,
        'setProperty',
      );
      const { result } = renderHook(() => useChatDockState(defaultOptions));
      act(() => {
        result.current.setAutoHideEnabled(true);
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(setProperty).toHaveBeenCalledWith(
        '--chat-dock-height',
        `${HEADER_HEIGHT}px`,
      );
    });

    test('sets --chat-dock-height to dock height when visible and open', () => {
      const setProperty = vi.spyOn(
        document.documentElement.style,
        'setProperty',
      );
      renderHook(() => useChatDockState(defaultOptions));
      expect(setProperty).toHaveBeenCalledWith('--chat-dock-height', '320px');
    });

    test('sets --chat-dock-height to header height when dock is closed', () => {
      const setProperty = vi.spyOn(
        document.documentElement.style,
        'setProperty',
      );
      renderHook(() =>
        useChatDockState({ ...defaultOptions, isDockOpen: false }),
      );
      expect(setProperty).toHaveBeenCalledWith(
        '--chat-dock-height',
        `${HEADER_HEIGHT}px`,
      );
    });
  });
});
