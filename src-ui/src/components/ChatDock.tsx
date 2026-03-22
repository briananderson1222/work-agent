import { useEffect, useRef, useState } from 'react';
import {
  activeChatsStore,
  useActiveChatActions,
  useRehydrateSessions,
} from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { CONFIG_DEFAULTS, useConfig } from '../contexts/ConfigContext';
import { useModelSupportsAttachments } from '../contexts/ModelCapabilitiesContext';
import { useModels } from '../contexts/ModelsContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useProject, useProjects } from '../contexts/ProjectsContext';
import { useProjectLayoutsQuery } from '@stallion-ai/sdk';
import { useActiveProject } from '../hooks/useActiveProject';
import { useChatDockActions } from '../hooks/useChatDockActions';
import { useChatDockKeyboardShortcuts } from '../hooks/useChatDockKeyboardShortcuts';
import { useChatDockState } from '../hooks/useChatDockState';
import { useChatInput } from '../hooks/useChatInput';
import { useDerivedSessions } from '../hooks/useDerivedSessions';
import { setDockModeOverride } from '../hooks/useDockModePreference';
import { useDragResize } from '../hooks/useDragResize';
import { useGitStatus } from '../hooks/useGitStatus';
import { GitBadge } from './GitBadge';
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
    selectedProject,
    isDockOpen,
    isDockMaximized,
    dockMode,
    activeChat,
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

  // Derive sessions from contexts (includes messages for all sessions)
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const sessions = useDerivedSessions(apiBase, selectedAgent, projectFilter);
  const rehydrateSessions = useRehydrateSessions(apiBase);

  // Get active session for chat input hook
  const activeSessionForHook =
    sessions.find((s) => s.id === activeSessionId) || null;
  const agentForHook = activeSessionForHook
    ? agents.find((a) => a.slug === activeSessionForHook.agentSlug)
    : null;
  const agentDefaultModelId = agentForHook?.model;

  // Resolve project context from the session's project (not the URL's)
  const sessionProjectSlug = activeSessionForHook?.projectSlug;
  const { project: sessionProject } = useProject(sessionProjectSlug ?? '');
  const sessionWorkingDir = sessionProject?.workingDirectory ?? null;
  const sessionProjectName = sessionProject?.name ?? activeSessionForHook?.projectName ?? sessionProjectSlug;
  const { data: gitStatus } = useGitStatus(sessionWorkingDir);
  const { data: sessionLayouts = [] } = useProjectLayoutsQuery(sessionProjectSlug ?? '', { enabled: !!sessionProjectSlug });
  const sessionCodingLayout = sessionLayouts.find((l: any) => l.type === 'coding');

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
      // Look up the newly assigned conversationId
      const convId = activeChatsStore.getSnapshot()[newSessionId]?.conversationId ?? null;
      setActiveChat(convId);
    },
    onAuthError: () => onRequestAuth?.(),
  });

  // Rehydrate sessions on mount
  useEffect(() => {
    rehydrateSessions();
  }, [rehydrateSessions]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  // Check if current model supports attachments
  const currentModelId =
    activeSession?.model ||
    agents.find((a) => a.slug === activeSession?.agentSlug)?.model;
  const bedrockModelSupportsAttachments = useModelSupportsAttachments(
    typeof currentModelId === 'string' ? currentModelId : undefined,
  );
  const activeAgent = activeSession
    ? agents.find((a) => a.slug === activeSession.agentSlug)
    : null;
  const modelSupportsAttachments =
    bedrockModelSupportsAttachments ||
    (activeAgent?.supportsAttachments ?? false);

  const unreadCount = sessions.filter((s) => s.hasUnread).length;

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
  useEffect(() => {
    if (!activeChat) return;
    const existing = sessions.find((s) => s.conversationId === activeChat);
    if (existing) {
      setActiveSessionId(existing.id);
      return;
    }
    // Not in memory — fetch from server and open
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/conversations/${encodeURIComponent(activeChat)}`);
        const json = await res.json();
        if (!json.success || !json.data) return;
        const conv = json.data;
        await openConversation(conv.id, conv.agentSlug, conv.projectSlug);
      } catch { /* conversation not found */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat, apiBase, openConversation, sessions.find, setActiveSessionId]);

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
              projects={projects}
              projectFilter={projectFilter}
              setProjectFilter={setProjectFilter}
              selectedProject={selectedProject}
            />

            {/* Project context breadcrumb for project-scoped sessions */}
            {activeSession?.projectSlug && (() => {
              const isCurrentProject = selectedProject === activeSession.projectSlug;
              const parts = sessionWorkingDir ? sessionWorkingDir.replace(/\/+$/, '').split('/') : [];
              const lastFolder = parts.pop() || '';
              const parentPath = parts.length ? `${parts.join('/')}/` : '';
              return (
                <div className="chat-dock__project-context">
                  <span className={`chat-dock__project-badge${isCurrentProject ? '' : ' chat-dock__project-badge--link'}`} onClick={isCurrentProject ? undefined : () => setProject(activeSession.projectSlug!)}>{sessionProjectName || activeSession.projectSlug}</span>
                  {sessionWorkingDir && (
                    <span
                      className={`chat-dock__project-dir${sessionCodingLayout ? ' chat-dock__project-dir--link' : ''}`}
                      onClick={sessionCodingLayout ? () => setLayout(activeSession.projectSlug!, sessionCodingLayout.slug) : undefined}
                    >
                      <span className="chat-dock__project-dir-parent">{parentPath}</span>
                      <span className="chat-dock__project-dir-leaf">{lastFolder}</span>
                    </span>
                  )}
                  {!sessionWorkingDir && (
                    <span className="chat-dock__project-dir chat-dock__project-dir--fallback">~ (defaults to home)</span>
                  )}
                  {gitStatus && <GitBadge git={gitStatus} />}
                </div>
              );
            })()}

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
          projects={projects}
          activeProjectSlug={activeProject}
          onSelect={(agent, projectSlug, projectName) => {
            openChatForAgent(agent, projectSlug, projectName);
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
        dockMode={dockMode}
        onDockModeChange={(mode) => {
          setDockModeOverride(null, mode);
          setDockMode(mode);
        }}
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
            openConversation(conversationId, agentSlug, activeProject ?? undefined, activeProjectName ?? undefined);
            setShowSessionPicker(false);
          }}
          onClose={() => setShowSessionPicker(false)}
        />
      )}
    </>
  );
}
