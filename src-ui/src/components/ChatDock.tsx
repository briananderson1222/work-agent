import { useEffect, useRef, useState } from 'react';
import {
  activeChatsStore,
  useActiveChatActions,
} from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { CONFIG_DEFAULTS, useConfig } from '../contexts/ConfigContext';
import { useModels } from '../contexts/ModelsContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useProjects } from '../contexts/ProjectsContext';
import { useActiveProject } from '../hooks/useActiveProject';
import { useRehydrateSessions } from '../hooks/useActiveChatSessions';
import { useChatDockActions } from '../hooks/useChatDockActions';
import { useChatDockKeyboardShortcuts } from '../hooks/useChatDockKeyboardShortcuts';
import { useChatDockState } from '../hooks/useChatDockState';
import { useChatInput } from '../hooks/useChatInput';
import { useDerivedSessions } from '../hooks/useDerivedSessions';
import { setDockModeOverride } from '../hooks/useDockModePreference';
import { useDragResize } from '../hooks/useDragResize';
import { providerLabel } from '../utils/execution';
import { ChatDockHeader } from './ChatDockHeader';
import { ChatDockTabBar } from './ChatDockTabBar';
import { ChatDockContentArea } from './chat-dock/ChatDockContentArea';
import { ChatDockModalStack } from './chat-dock/ChatDockModalStack';
import { ChatDockProjectContext } from './chat-dock/ChatDockProjectContext';
import { useChatDockActiveChatSync } from './chat-dock/useChatDockActiveChatSync';
import { useChatDockViewModel } from './chat-dock/useChatDockViewModel';

interface ChatDockProps {
  onRequestAuth?: () => void;
}

export function ChatDock({ onRequestAuth }: ChatDockProps) {
  // Get data from contexts
  const { apiBase } = useApiBase();
  const {
    selectedAgent,
    selectedProject,
    isDockOpen,
    isDockMaximized,
    dockMode,
    activeChat,
    pathname,
    setActiveChat,
    setDockMode,
    setProject,
    setLayout,
  } = useNavigation();
  const agents = useAgents();
  const { projects } = useProjects();
  const { projectSlug: activeProject, projectName: activeProjectName } =
    useActiveProject();
  const availableModels = useModels();
  const appConfig = useConfig();
  const defaultFontSize =
    appConfig?.defaultChatFontSize ?? CONFIG_DEFAULTS.defaultChatFontSize;

  // Consolidated UI state
  const {
    dockHeight,
    setDockHeight,
    dockWidth: _dockWidth,
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
  } = useChatDockState({ defaultFontSize, isDockOpen, isDockMaximized });

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Derive sessions from contexts (includes messages for all sessions)
  const [projectFilter, _setProjectFilter] = useState<string | null>(null);
  const sessions = useDerivedSessions(apiBase, selectedAgent, projectFilter);
  const rehydrateSessions = useRehydrateSessions(apiBase);
  const {
    activeSession,
    activeSessionForHook,
    agentDefaultModelId,
    effectiveModels,
    executionSummary,
    gitStatus,
    modelSupportsAttachments,
    sessionCodingLayout,
    sessionProjectName,
    sessionWorkingDir,
    unreadCount,
  } = useChatDockViewModel({
    activeSessionId,
    availableModels,
    agents,
    sessions,
  });

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
      // Look up the newly assigned conversationId
      const convId =
        activeChatsStore.getSnapshot()[newSessionId]?.conversationId ?? null;
      setActiveChat(convId);
    },
    onAuthError: () => onRequestAuth?.(),
    onOpenNewChat: () => setShowNewChatModal(true),
  });

  // Rehydrate sessions on mount
  useEffect(() => {
    rehydrateSessions();
  }, [rehydrateSessions]);

  // Get updateChat from context
  const { updateChat } = useActiveChatActions();

  // Refs
  const chatSectionRef = useRef<HTMLDivElement>(null);

  // Session management actions
  const { focusSession, removeSession, openChatForAgent, openConversation } =
    useChatDockActions({
      sessions,
      agents,
      activeSessionId,
      setActiveSessionId,
    });

  // Sync activeChat (conversationId) from URL to local state
  useChatDockActiveChatSync({
    activeChat,
    apiBase,
    sessions,
    openConversation,
    setActiveChat,
    setActiveSessionId,
  });

  // Drag to resize
  useDragResize({
    isDragging,
    setIsDragging,
    setHeight: setDockHeight,
    setWidth: setDockWidth,
    direction: dockMode === 'right' ? 'horizontal' : 'vertical',
  });

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

  const isRight = dockMode === 'right';

  return (
    <>
      <div
        className={`chat-dock ${!isDockOpen ? 'is-collapsed' : ''} ${isDockMaximized ? 'is-maximized' : ''} ${isDragging ? 'is-dragging' : ''} ${dockMode !== 'bottom' ? `chat-dock--${dockMode}` : ''}`}
        style={
          isRight
            ? { width: isDockMaximized ? '100%' : undefined }
            : {
                height: !isDockOpen
                  ? 'var(--chat-dock-header-height)'
                  : isDockMaximized
                    ? `calc(100vh - var(--app-toolbar-height))`
                    : `${dockHeight}px`,
              }
        }
        ref={chatSectionRef}
      >
        {isDockOpen && !isDockMaximized && (
          <div
            className={`chat-dock__resize-handle ${isRight ? 'chat-dock__resize-handle--horizontal' : ''}`}
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
          isDragging={isDragging}
          setIsDragging={setIsDragging}
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
              isHistoryOpen={isHistoryOpen}
              onToggleHistory={() => setIsHistoryOpen((v) => !v)}
              focusSession={focusSession}
              removeSession={removeSession}
              openChatForAgent={openChatForAgent}
              setShowSessionPicker={setShowSessionPicker}
              setShowNewChatModal={setShowNewChatModal}
            />

            {activeSession?.projectSlug &&
              <ChatDockProjectContext
                selectedProjectSlug={selectedProject}
                projectSlug={activeSession.projectSlug}
                projectName={sessionProjectName}
                workingDirectory={sessionWorkingDir}
                codingLayoutSlug={sessionCodingLayout?.slug ?? null}
                gitStatus={gitStatus}
                onSelectProject={(projectSlug) => setProject(projectSlug)}
                onOpenLayout={(projectSlug, layoutSlug) =>
                  setLayout(projectSlug, layoutSlug)
                }
              />}
            <ChatDockContentArea
              activeSession={activeSession}
              activeSessionId={activeSessionId}
              sessions={sessions}
              agents={agents}
              chatFontSize={chatFontSize}
              dockHeight={dockHeight}
              showStatsPanel={showStatsPanel}
              showReasoning={showReasoning}
              showToolDetails={showToolDetails}
              modelSupportsAttachments={modelSupportsAttachments}
              agentDefaultModelId={agentDefaultModelId}
              availableModels={effectiveModels}
              chatInput={chatInput}
              isHistoryOpen={isHistoryOpen}
              onCloseHistory={() => setIsHistoryOpen(false)}
              onToggleStatsPanel={setShowStatsPanel}
              onTitleUpdate={(sessionId, title) =>
                updateChat(sessionId, { title })
              }
              onDeleteSession={removeSession}
              onFocusSession={focusSession}
              onOpenConversation={openConversation}
            />
          </>
        )}
      </div>

      <ChatDockModalStack
        agents={agents}
        projects={projects}
        activeProjectSlug={activeProject}
        activeProjectName={activeProjectName}
        sessions={sessions}
        showNewChatModal={showNewChatModal}
        showChatSettings={showChatSettings}
        showSessionPicker={showSessionPicker}
        chatFontSize={chatFontSize}
        defaultFontSize={defaultFontSize}
        showReasoning={showReasoning}
        showToolDetails={showToolDetails}
        dockMode={dockMode}
        pathname={pathname}
        activeProviderLabel={providerLabel(executionSummary.provider)}
        activeModel={executionSummary.model || ''}
        activeSessionStatus={executionSummary.status}
        onSelectNewChat={(agent, projectSlug, projectName) => {
          openChatForAgent(agent, projectSlug, projectName);
          setShowNewChatModal(false);
        }}
        onCloseNewChat={() => setShowNewChatModal(false)}
        onCloseSettings={() => setShowChatSettings(() => false)}
        onCloseSessionPicker={() => setShowSessionPicker(false)}
        onSessionPickerSelect={openConversation}
        onChatFontSizeChange={setChatFontSize}
        onShowReasoningChange={setShowReasoning}
        onShowToolDetailsChange={setShowToolDetails}
        onDockModeChange={(mode, currentPathname) => {
          const layoutKey =
            currentPathname.startsWith('/projects/') &&
            currentPathname.includes('/layouts/')
              ? 'coding'
              : null;
          setDockModeOverride(layoutKey, mode);
          setDockMode(mode);
        }}
      />
    </>
  );
}
