import React, { useEffect, useRef } from 'react';
import { SessionPickerModal } from './SessionPickerModal';
import { ConversationStats } from './ConversationStats';
import { AgentBadge } from './AgentBadge';
import { StreamingMessage } from './StreamingMessage';
import { ReasoningSection } from './ReasoningSection';
import { ToolCallDisplay } from './ToolCallDisplay';
import { ChatEmptyState } from './ChatEmptyState';
import { SystemEventMessage } from './SystemEventMessage';
import { MessageBubble } from './MessageBubble';
import { EphemeralMessage } from './EphemeralMessage';
import { ChatInputArea } from './ChatInputArea';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import { NewChatModal } from './NewChatModal';
import { QueuedMessages } from './QueuedMessages';
import { ChatDockHeader } from './ChatDockHeader';
import { ChatDockTabBar } from './ChatDockTabBar';
import { ChatSettingsPanel } from './ChatSettingsPanel';
import { useDerivedSessions } from '../hooks/useDerivedSessions';
import { useChatInput } from '../hooks/useChatInput';
import { useChatDockActions } from '../hooks/useChatDockActions';
import { useChatDockState } from '../hooks/useChatDockState';
import { useDragResize } from '../hooks/useDragResize';
import { useChatDockKeyboardShortcuts } from '../hooks/useChatDockKeyboardShortcuts';
import { useShortcutDisplay } from '../hooks/useKeyboardShortcut';
import { useActiveChatActions, useActiveChatState, useRehydrateSessions } from '../contexts/ActiveChatsContext';
import { useToast } from '../contexts/ToastContext';
import { useConfig, CONFIG_DEFAULTS } from '../contexts/ConfigContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useAgents } from '../contexts/AgentsContext';
import { useModels } from '../contexts/ModelsContext';

import { useToolApproval } from '../hooks/useToolApproval';
import { getAgentIconStyle, getInitials } from '../utils/workspace';
import { useModelSupportsAttachments } from '../contexts/ModelCapabilitiesContext';
import { log } from '@/utils/logger';
import type { AgentSummary } from '../types';

interface ChatDockProps {
  onRequestAuth?: () => void;
}

export function ChatDock({ onRequestAuth }: ChatDockProps) {
  // Get data from contexts
  const { apiBase } = useApiBase();
  const { selectedAgent, isDockOpen, isDockMaximized, activeChat, setDockState, setActiveChat } = useNavigation();
  const agents = useAgents();
  const availableModels = useModels(apiBase);
  const { showToast } = useToast();
  const appConfig = useConfig();
  const defaultFontSize = appConfig?.defaultChatFontSize ?? CONFIG_DEFAULTS.defaultChatFontSize;
  const handleToolApproval = useToolApproval(apiBase);
  
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
    removingMessageContent, setRemovingMessageContent,
  } = useChatDockState({ defaultFontSize, isDockOpen, isDockMaximized });
  
  // Derive sessions from contexts (includes messages for all sessions)
  const sessions = useDerivedSessions(apiBase, selectedAgent);
  const { initChat, updateChat, clearInput, removeChat, addEphemeralMessage, clearEphemeralMessages, addToInputHistory, navigateHistoryUp, navigateHistoryDown } = useActiveChatActions();
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
  
  // Shortcut displays
  const toggleDockShortcut = useShortcutDisplay('dock.toggle');
  const maximizeShortcut = useShortcutDisplay('dock.maximize');
  const newChatShortcut = useShortcutDisplay('dock.newChat');
  const openConversationShortcut = useShortcutDisplay('dock.openConversation');
  const closeTabShortcut = useShortcutDisplay('dock.closeTab');
  
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
              ? `calc(100vh - 46px)` 
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
          isDockOpen={isDockOpen}
          isDockMaximized={isDockMaximized}
          sessions={sessions}
          unreadCount={unreadCount}
          toggleDockShortcut={toggleDockShortcut}
          maximizeShortcut={maximizeShortcut}
          dockHeight={dockHeight}
          previousDockHeight={previousDockHeight}
          previousDockOpen={previousDockOpen}
          setDockHeight={setDockHeight}
          setPreviousDockHeight={setPreviousDockHeight}
          setPreviousDockOpen={setPreviousDockOpen}
          setDockState={setDockState}
          setShowChatSettings={setShowChatSettings}
          focusSession={focusSession}
        />

        {isDockOpen && (
          <>
            <ChatDockTabBar
              sessions={sessions}
              activeSessionId={activeSessionId}
              agents={agents}
              availableModels={availableModels}
              apiBase={apiBase}
              chatDockRef={chatSectionRef}
              closeTabShortcut={closeTabShortcut}
              newChatShortcut={newChatShortcut}
              openConversationShortcut={openConversationShortcut}
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
                <>
                  {(() => {
                    const agent = agents.find(a => a.slug === activeSession.agentSlug);
                    return (
                      <>
                  {showStatsPanel && (
                    <ConversationStats
                      agentSlug={activeSession.agentSlug}
                      conversationId={activeSession.conversationId || ''}
                      apiBase={apiBase}
                      isVisible={showStatsPanel}
                      onToggle={() => setShowStatsPanel(!showStatsPanel)}
                      messageCount={activeSession.messages.length}
                      key={`${activeSession.conversationId || activeSession.agentSlug}-${activeSession.status}`}
                    />
                  )}
                  <div 
                    className="chat-messages"
                    ref={messagesContainerRef}
                    style={{ fontSize: `${chatFontSize}px` }}
                    onScroll={(e) => {
                      const target = e.currentTarget;
                      const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 10;
                      setIsUserScrolledUp(!isAtBottom);
                    }}
                  >
                    {activeSession.messages.length === 0 ? (
                      <ChatEmptyState agentName={activeSession.agentName} />
                    ) : (
                      <>
                        {activeSession.messages.map((msg, idx) => {
                          
                          const textContent = msg.contentParts?.filter(p => p.type === 'text').map(p => p.content).join('\n') || msg.content || '';
                          
                          // Handle ephemeral messages with special styling
                          if (msg.ephemeral) {
                            const messageId = msg.id || `ephemeral-${idx}`;
                            return (
                              <EphemeralMessage
                                key={messageId}
                                msg={msg}
                                idx={idx}
                                fontSize={chatFontSize}
                                isRemoving={removingMessages.has(messageId)}
                                onDismiss={() => {
                                  setRemovingMessages(prev => new Set(prev).add(messageId));
                                  setTimeout(() => {
                                    const updated = ephemeralMessages.filter(m => (m.id || `ephemeral-${ephemeralMessages.indexOf(m)}`) !== messageId);
                                    if (updated.length === 0) {
                                      clearEphemeralMessages(activeSession.id);
                                    } else {
                                      updateChat(activeSession.id, { ephemeralMessages: updated });
                                    }
                                    setRemovingMessages(prev => {
                                      const next = new Set(prev);
                                      next.delete(messageId);
                                      return next;
                                    });
                                  }, 300);
                                }}
                                onAction={msg.action ? () => {
                                  msg.action.handler();
                                  clearEphemeralMessages(activeSession.id);
                                } : undefined}
                              />
                            );
                          }
                          
                          // Check if this is a system event message
                          const isSystemEvent = msg.role === 'user' && textContent.startsWith('[SYSTEM_EVENT]');
                          const displayContent = isSystemEvent ? textContent.replace(/^\[SYSTEM_EVENT\]\s*/, '') : textContent;
                          
                          // Render system events with special styling
                          if (isSystemEvent) {
                            return (
                              <SystemEventMessage 
                                key={`${activeSession.id}-msg-${idx}`}
                                messageKey={`${activeSession.id}-msg-${idx}`}
                                content={displayContent}
                              />
                            );
                          }
                          
                          return (
                            <MessageBubble
                              key={`${activeSession.id}-msg-${idx}`}
                              msg={msg}
                              idx={idx}
                              activeSession={activeSession}
                              agents={agents}
                              chatFontSize={chatFontSize}
                              showReasoning={showReasoning}
                              showToolDetails={showToolDetails}
                              onCopy={(text) => {
                                navigator.clipboard.writeText(text);
                                showToast('Copied to clipboard');
                              }}
                              onToolApproval={handleToolApproval}
                            />
                          );
                        })}
                        
                        {/* Render streaming message with direct DOM updates (bypasses React batching) */}
                        {activeSession.status === 'sending' && (
                          <StreamingMessage
                            sessionId={activeSession.id}
                            agentIcon={(() => {
                              const agent = agents.find(a => a.slug === activeSession.agentSlug);
                              return agent?.icon || getInitials(agent?.name || 'AI');
                            })()}
                            agentIconStyle={(() => {
                              const agent = agents.find(a => a.slug === activeSession.agentSlug);
                              return agent ? getAgentIconStyle(agent, 20) : {
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                background: 'var(--accent-primary)',
                                fontSize: '11px',
                                flexShrink: 0,
                                color: 'var(--text-primary)',
                              };
                            })()}
                            fontSize={chatFontSize}
                            showReasoning={showReasoning}
                            renderReasoning={(content, i) => (
                              <ReasoningSection key={i} content={content} fontSize={chatFontSize} show={showReasoning} />
                            )}
                            renderToolCall={(part, i) => (
                              <ToolCallDisplay 
                                key={i} 
                                toolCall={part}
                                showDetails={showToolDetails}
                                onApprove={part.tool?.needsApproval ? (action) => {
                                  handleToolApproval(
                                    activeSession.id,
                                    activeSession.agentSlug,
                                    part.tool!.approvalId!,
                                    part.tool!.name,
                                    action
                                  );
                                } : undefined}
                              />
                            )}
                          />
                        )}
                        
                      </>
                    )}
                  </div>
                  {isUserScrolledUp && (
                    <ScrollToBottomButton
                      onClick={() => {
                        if (messagesContainerRef.current) {
                          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
                          setIsUserScrolledUp(false);
                        }
                      }}
                    />
                  )}
                  <QueuedMessages sessionId={activeSession.id} messages={activeSession.queuedMessages} />
                  <ChatInputArea
                    agentSlug={activeSession.agentSlug}
                    conversationId={activeSession.conversationId}
                    messageCount={activeSession.messages.length}
                    input={chatInput.input}
                    attachments={chatInput.attachments}
                    textareaRef={chatInput.textareaRef}
                    disabled={!agent}
                    isSending={activeSession.status === 'sending'}
                    hasAbortController={!!activeSession.abortController}
                    modelSupportsAttachments={modelSupportsAttachments}
                    fontSize={chatFontSize}
                    dockHeight={dockHeight}
                    apiBase={apiBase}
                    currentModel={chatInput.currentModel}
                    agentDefaultModel={agentDefaultModelId}
                    availableModels={availableModels}
                    modelQuery={chatInput.modelQuery}
                    commandQuery={chatInput.commandQuery}
                    slashCommands={chatInput.slashCommands}
                    onInputChange={chatInput.handleInputChange}
                    onSend={chatInput.handleSend}
                    onCancel={chatInput.handleCancel}
                    onClearInput={chatInput.handleClearInput}
                    onAddAttachments={chatInput.handleAddAttachments}
                    onRemoveAttachment={chatInput.handleRemoveAttachment}
                    onModelSelect={chatInput.handleModelSelect}
                    onModelClose={chatInput.handleModelClose}
                    onModelOpen={chatInput.handleModelOpen}
                    onCommandSelect={chatInput.handleCommandSelect}
                    onCommandClose={chatInput.handleCommandClose}
                    onHistoryUp={chatInput.handleHistoryUp}
                    onHistoryDown={chatInput.handleHistoryDown}
                    onShowStats={() => setShowStatsPanel(true)}
                    updateFromInput={chatInput.updateFromInput}
                    closeAll={chatInput.closeAll}
                  />
                      </>
                    );
                  })()}
                </>
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

      {/* New Chat Modal */}
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
