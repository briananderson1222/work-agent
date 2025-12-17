import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SessionManagementMenu } from './SessionManagementMenu';
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
import { SessionTab } from './SessionTab';
import { QueuedMessages } from './QueuedMessages';
import { useDerivedSessions } from '../hooks/useDerivedSessions';
import { useChatInput } from '../hooks/useChatInput';
import { useKeyboardShortcut, useShortcutDisplay } from '../hooks/useKeyboardShortcut';
import { useActiveChatActions, useActiveChatState, useCreateChatSession, useCancelMessage, useOpenConversation, useRehydrateSessions } from '../contexts/ActiveChatsContext';
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
  
  // DEBUG: Log when component renders
  const renderTimestamp = new Date().toISOString();

  
  // Chat dock UI state (height and dragging only - open/maximized from navigation)
  const [dockHeight, setDockHeight] = useState(400);
  const [previousDockHeight, setPreviousDockHeight] = useState(400);
  const [previousDockOpen, setPreviousDockOpen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  
  // Update CSS variable for content-view padding
  useEffect(() => {
    const height = !isDockOpen ? 43 : isDockMaximized ? window.innerHeight - 107 : dockHeight;
    document.documentElement.style.setProperty('--chat-dock-height', `${height}px`);
  }, [isDockOpen, isDockMaximized, dockHeight]);
  
  // Chat UI state
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
  const [showScrollButtons, setShowScrollButtons] = useState({ left: false, right: false });
  
  // Session state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  
  // Track removing messages for animation
  const [removingMessages, setRemovingMessages] = useState<Set<string>>(new Set());
  const [removingMessageContent, setRemovingMessageContent] = useState<Map<string, any>>(new Map());
  
  // Derive sessions from contexts (includes messages for all sessions)
  const sessions = useDerivedSessions(apiBase, selectedAgent);
  const { initChat, updateChat, clearInput, removeChat, addEphemeralMessage, clearEphemeralMessages, addToInputHistory, navigateHistoryUp, navigateHistoryDown } = useActiveChatActions();
  const openConversationAction = useOpenConversation(apiBase);
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
  
  // Cancel message handler
  const cancelMessage = useCancelMessage();
  
  // Create chat session handler
  const createChatSession = useCreateChatSession();
  
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
  const tabListRef = useRef<HTMLDivElement>(null);
  const isDockOpenRef = useRef(isDockOpen);
  
  // Update ref when state changes
  useEffect(() => {
    isDockOpenRef.current = isDockOpen;
  }, [isDockOpen]);
  
  // Handlers
  const focusSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setActiveChat(sessionId);
    setDockState(true, isDockMaximized);
    updateChat(sessionId, { hasUnread: false });
    
    // Scroll to bottom after session is focused
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
        setIsUserScrolledUp(false);
      }
    }, 100);
  }, [updateChat, setDockState, isDockMaximized, setActiveChat]);
  
  const removeSession = useCallback((sessionId: string) => {
    removeChat(sessionId);
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter(s => s.id !== sessionId);
      const next = remaining[remaining.length - 1]?.id ?? null;
      setActiveSessionId(next);
      setActiveChat(next);
    }
  }, [removeChat, activeSessionId, sessions, setActiveChat]);
  
  const openChatForAgent = useCallback((agent: AgentSummary) => {
    const sessionId = createChatSession(agent.slug, agent.name);
    setActiveSessionId(sessionId);
    setActiveChat(sessionId);
    setDockState(true, false);
    
    // Focus the textarea after chat is opened
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
        setIsUserScrolledUp(false);
      }
    }, 100);
  }, [createChatSession, setDockState, setActiveChat]);
  
  const openConversation = useCallback(async (conversationId: string, agentSlug: string) => {
    const agent = agents.find(a => a.slug === agentSlug);
    if (!agent) return;
    
    // Check if already open
    const existing = sessions.find(s => s.conversationId === conversationId);
    if (existing) {
      focusSession(existing.id);
      return;
    }
    
    const sessionId = await openConversationAction(conversationId, agentSlug, agent.name);
    setActiveSessionId(sessionId);
    setActiveChat(sessionId);
    setDockState(true, false);
    
    // Scroll to bottom after conversation is opened
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
        setIsUserScrolledUp(false);
      }
    }, 100);
  }, [agents, sessions, focusSession, openConversationAction, setActiveChat, setDockState]);
  
  
  // Drag to resize
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY;
      setDockHeight(Math.max(200, Math.min(newHeight, window.innerHeight - 150)));
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);
  
  // Scroll buttons visibility
  useEffect(() => {
    const checkScroll = () => {
      if (tabListRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = tabListRef.current;
        setShowScrollButtons({
          left: scrollLeft > 0,
          right: scrollLeft < scrollWidth - clientWidth - 1,
        });
      }
    };
    
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [sessions.length]);
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (!isUserScrolledUp && messagesContainerRef.current && activeSession) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [activeSession?.messages, ephemeralMessages, isUserScrolledUp]);
  
  // Ctrl+C to cancel active request
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'c' && activeSession?.status === 'sending') {
        e.preventDefault();
        cancelMessage(activeSession.id);
        showToast('Request cancelled');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSession, cancelMessage, showToast]);
  
  // Keyboard shortcuts
  useKeyboardShortcut('dock.toggle', 'd', ['cmd'], 'Toggle dock', useCallback(() => {
    setDockState(!isDockOpen, isDockMaximized);
  }, [isDockOpen, isDockMaximized, setDockState]));

  useKeyboardShortcut('dock.maximize', 'm', ['cmd'], 'Maximize/restore dock', useCallback(() => {
    if (isDockMaximized) {
      setDockHeight(previousDockHeight);
      setDockState(previousDockOpen, false);
    } else {
      setPreviousDockHeight(dockHeight);
      setPreviousDockOpen(isDockOpen);
      setDockHeight(window.innerHeight - 107);
      setDockState(true, true);
    }
  }, [isDockMaximized, dockHeight, isDockOpen, previousDockHeight, previousDockOpen, setDockState]));

  useKeyboardShortcut('dock.newChat', 't', ['cmd'], 'New chat', useCallback(() => {
    if (selectedAgent) {
      const newSessionId = `session-${Date.now()}`;
      initChat(newSessionId, selectedAgent, null);
      setActiveSessionId(newSessionId);
      setActiveChat(newSessionId);
      
      // Scroll to bottom after chat is created
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTo({
            top: messagesContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
          setIsUserScrolledUp(false);
        }
      }, 100);
    }
  }, [selectedAgent, initChat, setActiveChat]));

  useKeyboardShortcut('dock.openConversation', 'o', ['cmd'], 'Open conversation', useCallback(() => {
    setShowSessionPicker(true);
  }, []));

  useKeyboardShortcut('dock.closeTab', 'x', ['cmd'], 'Close tab', useCallback(() => {
    if (activeSessionId && sessions.length > 1) {
      const currentIndex = sessions.findIndex(s => s.id === activeSessionId);
      const nextSession = sessions[currentIndex + 1] || sessions[currentIndex - 1];
      if (nextSession) {
        focusSession(nextSession.id);
      }
      removeChat(activeSessionId);
    }
  }, [activeSessionId, sessions, focusSession, removeChat]));

  // Session switching shortcuts (⌘1-9)
  for (let i = 1; i <= 9; i++) {
    useKeyboardShortcut(`dock.session${i}`, String(i), ['cmd'], `Switch to session ${i}`, useCallback(() => {
      if (sessions[i - 1]) {
        focusSession(sessions[i - 1].id);
      }
    }, [sessions, focusSession]));
  }

  // Cancel ongoing request with Ctrl+C
  useKeyboardShortcut('dock.cancel', 'c', ['ctrl'], 'Cancel request', useCallback(() => {
    if (activeSession?.abortController) {
      cancelMessage(activeSession.id);
      addEphemeralMessage(activeSession.id, {
        role: 'system',
        content: 'User canceled the ongoing request.'
      });
    }
  }, [activeSession, cancelMessage, addEphemeralMessage]));
  
  return (
    <>
      <div
        className={`chat-dock ${!isDockOpen ? 'is-collapsed' : ''} ${isDockMaximized ? 'is-maximized' : ''} ${isDragging ? 'is-dragging' : ''}`}
        style={{ 
          height: !isDockOpen 
            ? '49px' 
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
        <div className="chat-dock__header" 
          onClick={() => {
            const newOpen = !isDockOpen;
            if (isDockMaximized) {
              setDockHeight(previousDockHeight);
              setDockState(newOpen, false);
            } else {
              setDockState(newOpen, false);
            }
          }}
          style={{
            cursor: 'pointer',
            ...(isDockMaximized && {
              background: 'rgba(var(--color-primary-rgb, 59, 130, 246), 0.1)',
              borderBottom: '2px solid var(--color-primary)'
            })
          }}>
          <div className="chat-dock__title" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Chat Dock</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{toggleDockShortcut}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowChatSettings(prev => !prev);
              }}
              title="Chat settings"
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                opacity: 1,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          <div className="chat-dock__header-actions" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const activeSessions = sessions.filter(s => s.status === 'sending');
              if (activeSessions.length > 0) {
                return (
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => {
                        const dropdown = document.getElementById('activity-dropdown');
                        if (dropdown) {
                          dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
                        }
                      }}
                      onMouseEnter={(e) => {
                        const dropdown = document.getElementById('activity-dropdown');
                        if (dropdown) dropdown.style.display = 'block';
                      }}
                      onMouseLeave={(e) => {
                        const dropdown = document.getElementById('activity-dropdown');
                        if (dropdown) dropdown.style.display = 'none';
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-primary)',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span className="loading-dots" style={{ display: 'inline-block' }}>
                        <span style={{ animationDelay: '0s' }}>●</span>
                        <span style={{ animationDelay: '0.2s' }}>●</span>
                        <span style={{ animationDelay: '0.4s' }}>●</span>
                      </span>
                      {activeSessions.length}
                    </button>
                    <div
                      id="activity-dropdown"
                      style={{
                        display: 'none',
                        position: 'absolute',
                        bottom: '100%',
                        right: 0,
                        marginBottom: '4px',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        minWidth: '200px',
                        zIndex: 1001,
                      }}
                    >
                      {activeSessions.map((session, idx) => {
                        const sessionIndex = sessions.findIndex(s => s.id === session.id);
                        return (
                          <button
                            key={session.id}
                            onClick={() => {
                              focusSession(session.id);
                              const dropdown = document.getElementById('activity-dropdown');
                              if (dropdown) dropdown.style.display = 'none';
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              border: 'none',
                              borderBottom: idx < activeSessions.length - 1 ? '1px solid var(--border-primary)' : 'none',
                              background: 'transparent',
                              textAlign: 'left',
                              cursor: 'pointer',
                              color: 'var(--text-primary)',
                              fontSize: '14px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {session.title}
                            </span>
                            {sessionIndex < 9 && (
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
                                ⌘{sessionIndex + 1}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              return null;
            })()}
            <span className="chat-dock__counter">
              {sessions.length} session{sessions.length === 1 ? '' : 's'}
            </span>
            {unreadCount > 0 && <span className="chat-dock__badge">{unreadCount}</span>}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isDockMaximized) {
                  setDockHeight(previousDockHeight);
                  setDockState(previousDockOpen, false);
                } else {
                  setPreviousDockHeight(dockHeight);
                  setPreviousDockOpen(isDockOpen);
                  setDockHeight(window.innerHeight - 107);
                  setDockState(true, true);
                }
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: '0.25rem 0.5rem',
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                opacity: 1,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              title={isDockMaximized ? `Restore (${maximizeShortcut})` : `Maximize (${maximizeShortcut})`}
            >
              {isDockMaximized ? '⬇' : '⬆'}
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{maximizeShortcut}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDockState(!isDockOpen, isDockMaximized);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title={!isDockOpen ? 'Expand' : 'Collapse'}
            >
              <svg style={{ 
                width: '16px', 
                height: '16px',
                transform: !isDockOpen ? 'rotate(0deg)' : 'rotate(180deg)',
                transition: 'transform 0.2s',
              }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {isDockOpen && (
          <>
            <div className="chat-dock__tabs">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, position: 'relative' }}>
                <SessionManagementMenu
                  sessions={sessions.filter(s => s.conversationId)}
                  activeSessionId={activeSessionId}
                  apiBase={apiBase}
                  agents={agents}
                  chatDockRef={chatSectionRef}
                  onTitleUpdate={(sessionId, title) => updateChat(sessionId, { title })}
                  onDelete={(sessionId) => removeSession(sessionId)}
                  onSelect={(sessionId) => focusSession(sessionId)}
                  onOpenConversation={openConversation}
                />
                {showScrollButtons.left && (
                  <button
                    type="button"
                    onClick={() => {
                      if (tabListRef.current) {
                        tabListRef.current.scrollBy({ left: -200, behavior: 'smooth' });
                      }
                    }}
                    style={{
                      position: 'absolute',
                      left: '48px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      zIndex: 10,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                      boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
                    }}
                  >
                    ←
                  </button>
                )}
                <div 
                  className="chat-dock__tab-list"
                  ref={tabListRef}
                  onScroll={() => {
                    if (tabListRef.current) {
                      const { scrollLeft, scrollWidth, clientWidth } = tabListRef.current;
                      setShowScrollButtons({
                        left: scrollLeft > 0,
                        right: scrollLeft < scrollWidth - clientWidth - 1,
                      });
                    }
                  }}
                >
                  {sessions.map((session, idx) => (
                    <SessionTab
                      key={session.id}
                      session={session}
                      index={idx}
                      isActive={session.id === activeSessionId}
                      agent={agents.find(a => a.slug === session.agentSlug)}
                      availableModels={availableModels}
                      closeTabShortcut={closeTabShortcut}
                      onFocus={() => focusSession(session.id)}
                      onRemove={() => removeSession(session.id)}
                    />
                  ))}
                </div>
                {showScrollButtons.right && (
                  <button
                    type="button"
                    onClick={() => {
                      if (tabListRef.current) {
                        tabListRef.current.scrollBy({ left: 200, behavior: 'smooth' });
                      }
                    }}
                    style={{
                      position: 'absolute',
                      right: '0',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      zIndex: 10,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                      boxShadow: '-2px 0 8px rgba(0,0,0,0.15)',
                    }}
                  >
                    →
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button
                  type="button"
                  className="chat-dock__new"
                  onClick={() => {
                    setShowSessionPicker(true);
                  }}
                  title={`Open Conversation (${openConversationShortcut})`}
                >
                  Open <span style={{ fontSize: '10px', opacity: 0.7 }}>{openConversationShortcut}</span>
                </button>
                <button
                  type="button"
                  className="chat-dock__new"
                  onClick={() => {
                    if (agents.length === 1) {
                      openChatForAgent(agents[0]);
                    } else {
                      setShowNewChatModal(true);
                      setNewChatSearch('');
                      setNewChatSelectedIndex(0);
                    }
                  }}
                  title={`New Chat (${newChatShortcut})`}
                >
                  + New <span style={{ fontSize: '10px', opacity: 0.7 }}>{newChatShortcut}</span>
                </button>
              </div>
            </div>

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
      {showChatSettings && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
          onClick={() => setShowChatSettings(false)}
        >
          <div 
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '400px',
              maxWidth: '500px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 600 }}>Chat Settings</h3>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>
                Font Size
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setChatFontSize(prev => Math.max(10, prev - 1))}
                  disabled={chatFontSize <= 10}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                    cursor: chatFontSize <= 10 ? 'not-allowed' : 'pointer',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    opacity: chatFontSize <= 10 ? 0.3 : 1
                  }}
                >
                  A−
                </button>
                <button
                  onClick={() => setChatFontSize(defaultFontSize)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    opacity: chatFontSize === defaultFontSize ? 0.5 : 1
                  }}
                >
                  A
                </button>
                <button
                  onClick={() => setChatFontSize(prev => Math.min(24, prev + 1))}
                  disabled={chatFontSize >= 24}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                    cursor: chatFontSize >= 24 ? 'not-allowed' : 'pointer',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    opacity: chatFontSize >= 24 ? 0.3 : 1
                  }}
                >
                  A+
                </button>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                  {chatFontSize}px ({Math.round((chatFontSize / defaultFontSize) * 100)}%)
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showReasoning}
                  onChange={(e) => setShowReasoning(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px', fontWeight: 500 }}>Show reasoning</span>
              </label>
              <p style={{ margin: '4px 0 0 24px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Display model reasoning steps in chat messages
              </p>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showToolDetails}
                  onChange={(e) => setShowToolDetails(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px', fontWeight: 500 }}>Show tool details</span>
              </label>
              <p style={{ margin: '4px 0 0 24px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Allow expanding tool calls to view arguments and results
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
              <button
                onClick={() => setShowChatSettings(false)}
                style={{
                  background: 'var(--accent-primary)',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

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
