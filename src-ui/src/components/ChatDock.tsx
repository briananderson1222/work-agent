import { useEffect, useRef } from 'react';
import {
  useActiveChatActions,
  useActiveChatState,
  useRehydrateSessions,
} from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { CONFIG_DEFAULTS, useConfig } from '../contexts/ConfigContext';
import { useModelSupportsAttachments } from '../contexts/ModelCapabilitiesContext';
import { useModels } from '../contexts/ModelsContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useChatDockActions } from '../hooks/useChatDockActions';
import { useChatDockKeyboardShortcuts } from '../hooks/useChatDockKeyboardShortcuts';
import { useChatDockState } from '../hooks/useChatDockState';
import { useChatInput } from '../hooks/useChatInput';
import { useDerivedSessions } from '../hooks/useDerivedSessions';
import { useDragResize } from '../hooks/useDragResize';
import { ChatDockBody } from './ChatDockBody';
import { ChatDockHeader } from './ChatDockHeader';
import { ChatDockTabBar } from './ChatDockTabBar';
import { ChatSettingsPanel } from './ChatSettingsPanel';
import { NewChatModal } from './NewChatModal';
import { SessionPickerModal } from './SessionPickerModal';

interface ChatDockProps {
  onRequestAuth?: () => void;
}

export function ChatDock({ onRequestAuth }: ChatDockProps) {
  // Get data from contexts
  const { apiBase } = useApiBase();
  const {
    selectedAgent,
    isDockOpen,
    isDockMaximized,
    activeChat,
    setActiveChat,
  } = useNavigation();
  const agents = useAgents();
  const availableModels = useModels(apiBase);
  const appConfig = useConfig();
  const defaultFontSize =
    appConfig?.defaultChatFontSize ?? CONFIG_DEFAULTS.defaultChatFontSize;

  // Consolidated UI state
  const {
    dockHeight,
    setDockHeight,
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
  } = useChatDockState({ defaultFontSize, isDockOpen, isDockMaximized });

  // Derive sessions from contexts (includes messages for all sessions)
  const sessions = useDerivedSessions(apiBase, selectedAgent);
  const rehydrateSessions = useRehydrateSessions(apiBase);

  // Get active session for chat input hook
  const activeSessionForHook =
    sessions.find((s) => s.id === activeSessionId) || null;
  const agentForHook = activeSessionForHook
    ? agents.find((a) => a.slug === activeSessionForHook.agentSlug)
    : null;
  const agentDefaultModelId = agentForHook
    ? typeof agentForHook.model === 'string'
      ? agentForHook.model
      : agentForHook.model?.modelId
    : undefined;

  // For ACP agents with their own model options, use those instead of Bedrock models
  const effectiveModels = agentForHook?.modelOptions || availableModels;

  // Chat input hook - encapsulates autocomplete, history, and input handling
  const chatInput = useChatInput({
    apiBase,
    sessionId: activeSessionId,
    agentSlug: activeSessionForHook?.agentSlug || null,
    conversationId: activeSessionForHook?.conversationId,
    availableModels: effectiveModels,
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
    if (activeChat && sessions.some((s) => s.id === activeChat)) {
      setActiveSessionId(activeChat);
    }
  }, [activeChat, sessions, setActiveSessionId]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;
  const activeChatState = useActiveChatState(activeSessionId);

  // Check if current model supports attachments
  const currentModelId =
    activeSession?.model ||
    agents.find((a) => a.slug === activeSession?.agentSlug)?.model;
  const bedrockModelSupportsAttachments = useModelSupportsAttachments(
    typeof currentModelId === 'string'
      ? currentModelId
      : currentModelId?.modelId,
  );
  const activeAgent = activeSession
    ? agents.find((a) => a.slug === activeSession.agentSlug)
    : null;
  const modelSupportsAttachments =
    bedrockModelSupportsAttachments ||
    (activeAgent?.supportsAttachments ?? false);

  const _ephemeralMessages = activeChatState?.ephemeralMessages || [];
  const unreadCount = sessions.filter((s) => s.hasUnread).length;

  // Get updateChat from context
  const { updateChat } = useActiveChatActions();

  // Refs
  const chatSectionRef = useRef<HTMLDivElement>(null);
  const _textareaRef = useRef<HTMLTextAreaElement>(null);

  // Session management actions
  const { focusSession, removeSession, openChatForAgent, openConversation } =
    useChatDockActions({
      sessions,
      agents,
      activeSessionId,
      setActiveSessionId,
    });

  // Drag to resize
  useDragResize({ isDragging, setIsDragging, setHeight: setDockHeight });

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
    setShowSessionPicker,
    focusSession,
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
              : `${dockHeight}px`,
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
                  modelSupportsAttachments={modelSupportsAttachments}
                  agentDefaultModelId={agentDefaultModelId}
                  availableModels={effectiveModels}
                  chatInput={chatInput}
                  setShowStatsPanel={setShowStatsPanel}
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
          activeConversationIds={
            sessions.map((s) => s.conversationId).filter(Boolean) as string[]
          }
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
