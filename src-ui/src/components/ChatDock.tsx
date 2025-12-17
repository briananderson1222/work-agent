import React, { useEffect, useRef } from 'react';
import { SessionPickerModal } from './SessionPickerModal';
import { NewChatModal } from './NewChatModal';
import { ChatDockHeader } from './ChatDockHeader';
import { ChatDockTabBar } from './ChatDockTabBar';
import { ChatDockBody } from './ChatDockBody';
import { ChatSettingsPanel } from './ChatSettingsPanel';
import { useDerivedSessions } from '../hooks/useDerivedSessions';
import { useChatInput } from '../hooks/useChatInput';
import { useChatDockActions } from '../hooks/useChatDockActions';
import { useChatDockState } from '../hooks/useChatDockState';
import { useDragResize } from '../hooks/useDragResize';
import { useChatDockKeyboardShortcuts } from '../hooks/useChatDockKeyboardShortcuts';
import { useActiveChatActions, useActiveChatState, useRehydrateSessions } from '../contexts/ActiveChatsContext';
import { useConfig, CONFIG_DEFAULTS } from '../contexts/ConfigContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useAgents } from '../contexts/AgentsContext';
import { useModels } from '../contexts/ModelsContext';
import { useModelSupportsAttachments } from '../contexts/ModelCapabilitiesContext';

interface ChatDockProps {
  onRequestAuth?: () => void;
}

export function ChatDock({ onRequestAuth }: ChatDockProps) {
  // Get data from contexts
  const { apiBase } = useApiBase();
  const { selectedAgent, isDockOpen, isDockMaximized, activeChat, setActiveChat } = useNavigation();
  const agents = useAgents();
  const availableModels = useModels(apiBase);
  const appConfig = useConfig();
  const defaultFontSize = appConfig?.defaultChatFontSize ?? CONFIG_DEFAULTS.defaultChatFontSize;
  
  // Consolidated UI state
  const {
    dockHeight, setDockHeight,
    previousDockHeight, setPreviousDockHeight,
    previousDockOpen, setPreviousDockOpen,
    isDragging, setIsDragging,
    chatFontSize, setChatFontSize,
    showStatsPanel, setShowStatsPanel,
    showReasoning, setShowReasoning,
    showToolDetails, setShowToolDetails,
    showChatSettings, setShowChatSettings,
    isUserScrolledUp, setIsUserScrolledUp,
    showNewChatModal, setShowNewChatModal,
    showSessionPicker, setShowSessionPicker,
    activeSessionId, setActiveSessionId,
    removingMessages, setRemovingMessages,
  } = useChatDockState({ defaultFontSize, isDockOpen, isDockMaximized });
  
  // Derive sessions from contexts (includes messages for all sessions)
  const sessions = useDerivedSessions(apiBase, selectedAgent);
  const { updateChat, clearEphemeralMessages } = useActiveChatActions();
  const rehydrateSessions = useRehydrateSessions(apiBase);
  
  // Get active session for chat input hook
  const activeSessionForHook = sessions.find(s => s.id === activeSessionId) || null;
  const agentForHook = activeSessionForHook ? agents.find(a => a.slug === activeSessionForHook.agentSlug) : null;
  const agentDefaultModelId = agentForHook ? (typeof agentForHook.model === 'string' ? agentForHook.model : agentForHook.model?.modelId) : undefined;
  
  // Chat input hook - encapsulates autocomplete, history, and input handling
  const chatInput = useChatInput({
    apiBase,
    sessionId: activeSessionId,
    agentSlug: activeSessionForHook?.agentSlug || null,
    conversationId: activeSessionForHook?.conversationId,
    availableModels,
    agentDefaultModel: agentDefaultModelId,
    onSessionMigrate: (newSessionId) => {
      setActiveSessionId(newSessionId);
      setActiveChat(newSessionId);
    },
    onAuthError: () => onRequestAuth?.(),
  });
  
  // Rehydrate sessions on mount
  useEffect(() => {
    rehydrateSessions();
  }, [rehydrateSessions]);
  
  // Sync activeChat from URL to local state on mount/change
  useEffect(() => {
    if (activeChat && sessions.some(s => s.id === activeChat)) {
      setActiveSessionId(activeChat);
    }
  }, [activeChat, sessions]);
  
  const activeSession = sessions.find(s => s.id === activeSessionId) || null;
  const activeChatState = useActiveChatState(activeSessionId);
  
  // Check if current model supports attachments
  const currentModelId = activeSession?.model || agents.find(a => a.slug === activeSession?.agentSlug)?.model;
  const modelSupportsAttachments = useModelSupportsAttachments(
    typeof currentModelId === 'string' ? currentModelId : currentModelId?.modelId
  );
  
  const ephemeralMessages = activeChatState?.ephemeralMessages || [];
  const unreadCount = sessions.filter(s => s.hasUnread).length;
  
  
  // Refs
  const chatSectionRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDockOpenRef = useRef(isDockOpen);
  
  // Update ref when state changes
  useEffect(() => {
    isDockOpenRef.current = isDockOpen;
  }, [isDockOpen]);
  
  // Session management actions
  const { focusSession, removeSession, openChatForAgent, openConversation } = useChatDockActions({
    apiBase,
    sessions,
    agents,
    activeSessionId,
    setActiveSessionId,
    setIsUserScrolledUp,
    messagesContainerRef,
    textareaRef,
  });
  
  // Drag to resize
  useDragResize({ isDragging, setIsDragging, setHeight: setDockHeight });
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (!isUserScrolledUp && messagesContainerRef.current && activeSession) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [activeSession?.messages, ephemeralMessages, isUserScrolledUp]);
  
  // Keyboard shortcuts
  useChatDockKeyboardShortcuts({
    sessions,
    activeSessionId,
    activeSession,
    dockHeight,
    previousDockHeight,
    previousDockOpen,
    setDockHeight,
    setPreviousDockHeight,
    setPreviousDockOpen,
    setActiveSessionId,
    setIsUserScrolledUp,
    setShowSessionPicker,
    focusSession,
    messagesContainerRef,
  });
  
  return (
    <>
      <div
        className={`chat-dock ${!isDockOpen ? 'is-collapsed' : ''} ${isDockMaximized ? 'is-maximized' : ''} ${isDragging ? 'is-dragging' : ''}`}
        style={{ 
          height: !isDockOpen 
            ? 'var(--chat-dock-header-height)' 
            : isDockMaximized 
              ? `calc(100vh - var(--app-toolbar-height))` 
              : `${dockHeight}px`
        }}
        ref={chatSectionRef}
      >
        {isDockOpen && !isDockMaximized && (
          <div
            className="chat-dock__resize-handle"
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
          />
        )}
        <ChatDockHeader
          sessions={sessions}
          unreadCount={unreadCount}
          dockHeight={dockHeight}
          previousDockHeight={previousDockHeight}
          previousDockOpen={previousDockOpen}
          setDockHeight={setDockHeight}
          setPreviousDockHeight={setPreviousDockHeight}
          setPreviousDockOpen={setPreviousDockOpen}
          setShowChatSettings={setShowChatSettings}
          focusSession={focusSession}
        />

        {isDockOpen && (
          <>
            <ChatDockTabBar
              sessions={sessions}
              activeSessionId={activeSessionId}
              chatDockRef={chatSectionRef}
              focusSession={focusSession}
              removeSession={removeSession}
              openConversation={openConversation}
              openChatForAgent={openChatForAgent}
              updateChat={updateChat}
              setShowSessionPicker={setShowSessionPicker}
              setShowNewChatModal={setShowNewChatModal}
            />

            <div className="chat-dock__body">
              {activeSession ? (
                <ChatDockBody
                  activeSession={activeSession}
                  chatFontSize={chatFontSize}
                  dockHeight={dockHeight}
                  showStatsPanel={showStatsPanel}
                  showReasoning={showReasoning}
                  showToolDetails={showToolDetails}
                  isUserScrolledUp={isUserScrolledUp}
                  modelSupportsAttachments={modelSupportsAttachments}
                  agentDefaultModelId={agentDefaultModelId}
                  availableModels={availableModels}
                  ephemeralMessages={ephemeralMessages}
                  removingMessages={removingMessages}
                  messagesContainerRef={messagesContainerRef}
                  chatInput={chatInput}
                  setShowStatsPanel={setShowStatsPanel}
                  setIsUserScrolledUp={setIsUserScrolledUp}
                  setRemovingMessages={setRemovingMessages}
                  updateChat={updateChat}
                  clearEphemeralMessages={clearEphemeralMessages}
                />
              ) : (
                <div className="empty-state">
                  <h3>No active session</h3>
                  <p>Click "+ New" to start a chat</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showNewChatModal && (
        <NewChatModal
          agents={agents}
          onSelect={(agent) => {
            openChatForAgent(agent);
            setShowNewChatModal(false);
          }}
          onClose={() => setShowNewChatModal(false)}
        />
      )}

      {/* Session Picker Modal */}
      <ChatSettingsPanel
        isOpen={showChatSettings}
        onClose={() => setShowChatSettings(() => false)}
        chatFontSize={chatFontSize}
        setChatFontSize={setChatFontSize}
        defaultFontSize={defaultFontSize}
        showReasoning={showReasoning}
        setShowReasoning={setShowReasoning}
        showToolDetails={showToolDetails}
        setShowToolDetails={setShowToolDetails}
      />

      {showSessionPicker && (
        <SessionPickerModal
          isOpen={showSessionPicker}
          apiBase={apiBase}
          agents={agents}
          activeConversationIds={sessions.map(s => s.conversationId).filter(Boolean) as string[]}
          onSelect={(conversationId, agentSlug) => {
            openConversation(conversationId, agentSlug);
            setShowSessionPicker(false);
          }}
          onClose={() => setShowSessionPicker(false)}
        />
      )}
    </>
  );
}
