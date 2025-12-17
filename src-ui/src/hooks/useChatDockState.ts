import { useState, useEffect } from 'react';

interface UseChatDockStateOptions {
  defaultFontSize: number;
  isDockOpen: boolean;
  isDockMaximized: boolean;
}

export function useChatDockState({ defaultFontSize, isDockOpen, isDockMaximized }: UseChatDockStateOptions) {
  // Dock sizing
  const [dockHeight, setDockHeight] = useState(400);
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
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);

  // Session state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Message removal animation state
  const [removingMessages, setRemovingMessages] = useState<Set<string>>(new Set());
  const [removingMessageContent, setRemovingMessageContent] = useState<Map<string, unknown>>(new Map());

  // Update CSS variable for content-view padding
  useEffect(() => {
    const headerHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--chat-dock-header-height'));
    const height = !isDockOpen ? headerHeight : isDockMaximized ? window.innerHeight - 107 : dockHeight;
    document.documentElement.style.setProperty('--chat-dock-height', `${height}px`);
  }, [isDockOpen, isDockMaximized, dockHeight]);

  return {
    // Dock sizing
    dockHeight, setDockHeight,
    previousDockHeight, setPreviousDockHeight,
    previousDockOpen, setPreviousDockOpen,
    isDragging, setIsDragging,
    // Chat UI
    chatFontSize, setChatFontSize,
    showStatsPanel, setShowStatsPanel,
    showReasoning, setShowReasoning,
    showToolDetails, setShowToolDetails,
    showChatSettings, setShowChatSettings,
    isUserScrolledUp, setIsUserScrolledUp,
    showNewChatModal, setShowNewChatModal,
    showSessionPicker, setShowSessionPicker,
    // Session
    activeSessionId, setActiveSessionId,
    // Animation
    removingMessages, setRemovingMessages,
    removingMessageContent, setRemovingMessageContent,
  };
}
