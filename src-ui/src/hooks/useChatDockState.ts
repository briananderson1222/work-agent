import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '../contexts/NavigationContext';

interface UseChatDockStateOptions {
  defaultFontSize: number;
  isDockOpen: boolean;
  isDockMaximized: boolean;
  activeSessionCount?: number;
}

const AUTO_HIDE_DELAY_MS = 5000;

export function useChatDockState({
  defaultFontSize,
  isDockOpen,
  isDockMaximized,
  activeSessionCount = 0,
}: UseChatDockStateOptions) {
  const { dockMode } = useNavigation();

  // Dock sizing
  const [dockHeight, setDockHeight] = useState(320);
  const [dockWidth, setDockWidth] = useState(400);
  const [previousDockHeight, setPreviousDockHeight] = useState(320);
  const [previousDockOpen, setPreviousDockOpen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // Chat UI toggles
  const [chatFontSize, setChatFontSize] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const querySize = params.get('fontSize');
    return querySize ? parseInt(querySize, 10) : defaultFontSize;
  });
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [showReasoning, setShowReasoning] = useState(true);
  const [showToolDetails, setShowToolDetails] = useState(true);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);

  // Session state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Auto-hide state
  const [autoHideEnabled, setAutoHideEnabled] = useState(
    () => localStorage.getItem('chatDockAutoHide') === 'true',
  );
  const [isAutoHidden, setIsAutoHidden] = useState(false);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist auto-hide preference
  useEffect(() => {
    localStorage.setItem('chatDockAutoHide', String(autoHideEnabled));
  }, [autoHideEnabled]);

  // Auto-hide timer: fires after idle delay when enabled, dock is open, not maximized, and no active sessions
  useEffect(() => {
    if (
      !autoHideEnabled ||
      !isDockOpen ||
      isDockMaximized ||
      activeSessionCount > 0
    ) {
      setIsAutoHidden(false);
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = null;
      }
      return;
    }
    autoHideTimerRef.current = setTimeout(() => {
      setIsAutoHidden(true);
    }, AUTO_HIDE_DELAY_MS);
    return () => {
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = null;
      }
    };
  }, [autoHideEnabled, isDockOpen, isDockMaximized, activeSessionCount]);

  // Resets auto-hide timer (call on mouse enter / dock interaction)
  const resetAutoHide = useCallback(() => {
    if (!autoHideEnabled) return;
    setIsAutoHidden(false);
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
    autoHideTimerRef.current = setTimeout(() => {
      setIsAutoHidden(true);
    }, AUTO_HIDE_DELAY_MS);
  }, [autoHideEnabled]);

  // Update CSS variables based on dock mode
  useEffect(() => {
    const root = document.documentElement;

    if (dockMode === 'right') {
      root.style.setProperty('--chat-dock-width', `${dockWidth}px`);
      root.style.setProperty('--chat-dock-height', '0px');
    } else {
      root.style.removeProperty('--chat-dock-width');
      const styles = getComputedStyle(root);
      const headerHeight = parseInt(
        styles.getPropertyValue('--chat-dock-header-height'),
        10,
      );
      const toolbarHeight = parseInt(
        styles.getPropertyValue('--app-toolbar-height'),
        10,
      );
      const height =
        !isDockOpen || isAutoHidden
          ? headerHeight
          : isDockMaximized
            ? window.innerHeight - toolbarHeight
            : dockHeight;
      root.style.setProperty('--chat-dock-height', `${height}px`);
    }
  }, [
    dockMode,
    dockWidth,
    isDockOpen,
    isDockMaximized,
    dockHeight,
    isAutoHidden,
  ]);

  return {
    dockHeight,
    setDockHeight,
    dockWidth,
    setDockWidth,
    previousDockHeight,
    setPreviousDockHeight,
    previousDockOpen,
    setPreviousDockOpen,
    isDragging,
    setIsDragging,
    chatFontSize,
    setChatFontSize,
    showStatsPanel,
    setShowStatsPanel,
    showReasoning,
    setShowReasoning,
    showToolDetails,
    setShowToolDetails,
    showChatSettings,
    setShowChatSettings,
    showNewChatModal,
    setShowNewChatModal,
    showSessionPicker,
    setShowSessionPicker,
    activeSessionId,
    setActiveSessionId,
    autoHideEnabled,
    setAutoHideEnabled,
    isAutoHidden,
    resetAutoHide,
  };
}
