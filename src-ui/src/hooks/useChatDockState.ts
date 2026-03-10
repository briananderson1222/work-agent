import { useEffect, useState } from 'react';
import { useNavigation } from '../contexts/NavigationContext';

interface UseChatDockStateOptions {
  defaultFontSize: number;
  isDockOpen: boolean;
  isDockMaximized: boolean;
}

export function useChatDockState({
  defaultFontSize,
  isDockOpen,
  isDockMaximized,
}: UseChatDockStateOptions) {
  const { dockMode } = useNavigation();

  // Dock sizing
  const [dockHeight, setDockHeight] = useState(400);
  const [dockWidth, setDockWidth] = useState(400);
  const [previousDockHeight, setPreviousDockHeight] = useState(400);
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

  // Update CSS variables based on dock mode
  useEffect(() => {
    const root = document.documentElement;

    if (dockMode === 'right') {
      root.style.setProperty('--chat-dock-width', `${dockWidth}px`);
      root.style.setProperty('--chat-dock-height', '0px');
    } else {
      root.style.removeProperty('--chat-dock-width');
      const styles = getComputedStyle(root);
      const headerHeight = parseInt(styles.getPropertyValue('--chat-dock-header-height'), 10);
      const toolbarHeight = parseInt(styles.getPropertyValue('--app-toolbar-height'), 10);
      const height = !isDockOpen
        ? headerHeight
        : isDockMaximized
          ? window.innerHeight - toolbarHeight
          : dockHeight;
      root.style.setProperty('--chat-dock-height', `${height}px`);
    }
  }, [dockMode, dockWidth, isDockOpen, isDockMaximized, dockHeight]);

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
  };
}
