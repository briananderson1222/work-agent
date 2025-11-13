import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { invoke } from '@tauri-apps/api/core';
import { SDKAdapter } from './core/SDKAdapter';
import { PermissionManager } from './core/PermissionManager';
import { EventRouter } from './core/EventRouter';
import { AgentSelector } from './components/AgentSelector';
import { Header } from './components/Header';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { AgentSelectorModal } from './components/AgentSelectorModal';
import { SessionPickerModal } from './components/SessionPickerModal';
import { SessionManagementMenu } from './components/SessionManagementMenu';
import { PinDialog } from './components/PinDialog';
import { ConversationStats, ContextPercentage } from './components/ConversationStats';
import { FileAttachmentInput } from './components/FileAttachmentInput';
import { ChatDock } from './components/ChatDock';
import { SessionTab } from './components/SessionTab';
import { useAppData } from './contexts/AppDataContext';
import { useApiBase } from './contexts/ApiBaseContext';
import { useConfig, CONFIG_DEFAULTS } from './contexts/ConfigContext';
import { useWorkspaces, useWorkspace } from './contexts/WorkspacesContext';
import { useAgents } from './contexts/AgentsContext';
import { useWorkflows } from './contexts/WorkflowsContext';
import { useConversationStatus } from './contexts/ConversationsContext';
import { useActiveChatActions } from './contexts/ActiveChatsContext';
import { useDerivedSessions, useEnrichedSession } from './hooks/useDerivedSessions';
import { WorkspaceRenderer } from './workspaces';
import { AgentEditorView } from './views/AgentEditorView';
import { WorkspaceEditorView } from './views/WorkspaceEditorView';
import { ToolManagementView } from './views/ToolManagementView';
import { WorkflowManagementView } from './views/WorkflowManagementView';
import { SettingsView } from './views/SettingsView';
import { useAwsAuth } from './hooks/useAwsAuth';
import { useStreamingMessage } from './hooks/useStreamingMessage';
import { setAuthCallback, apiRequest } from './lib/apiClient';
import { getAgentIcon } from './utils/workspace';
import { getModelCapabilities } from './utils/modelCapabilities';
import type {
  AgentSummary,
  AgentQuickPrompt,
  ChatMessage,
  ChatSession,
  WorkflowMetadata,
  NavigationView,
  FileAttachment,
} from './types';

import { ApiBaseProvider } from './contexts/ApiBaseContext';

function ToolCallDisplay({ toolCall, onApprove }: { 
  toolCall: { id: string; name: string; args: any; result?: any; state?: string; error?: string; needsApproval?: boolean }; 
  onApprove?: (action: 'once' | 'trust' | 'deny') => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Only log when expanded to reduce noise
  if (isExpanded) {
    console.log('[ToolCallDisplay expanded]', { 
      id: toolCall.id, 
      name: toolCall.name, 
      hasResult: !!toolCall.result,
      resultKeys: toolCall.result ? Object.keys(toolCall.result) : []
    });
  }
  
  // Create abbreviated args preview
  const argsPreview = toolCall.args 
    ? Object.keys(toolCall.args).length > 0
      ? Object.keys(toolCall.args).map(k => `${k}: ${JSON.stringify(toolCall.args[k])}`).join(', ')
      : 'no args'
    : 'no args';

  return (
    <div className="tool-call" style={{ 
      display: 'block', 
      margin: '0.5rem 0',
      padding: '0.5rem',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: '4px',
    }}>
      <button 
        className="tool-call__header" 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          display: 'block',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          color: 'inherit',
          textAlign: 'left',
          width: '100%'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
          <span className="tool-call__toggle">{isExpanded ? '▼' : '▶'}</span>
          <span className="tool-call__name" style={{ fontWeight: 500 }}>{toolCall.name}</span>
          {toolCall.result && !toolCall.error && <span style={{ color: 'var(--success-primary)' }} title="Success">✓</span>}
          {toolCall.error && <span style={{ color: 'var(--error-primary)' }} title="Error">✗</span>}
          {toolCall.needsApproval && onApprove && !toolCall.error && !toolCall.result && !toolCall.cancelled && (
            <>
              <button 
                onClick={() => onApprove('once')} 
                style={{ 
                  padding: '2px 6px', 
                  fontSize: '0.7em',
                  background: 'var(--color-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: 400,
                  marginLeft: '0.25rem'
                }}
                onMouseDown={(e) => e.target.style.transform = 'scale(0.95)'}
                onMouseUp={(e) => e.target.style.transform = 'scale(1)'}
                onMouseOver={(e) => e.target.style.opacity = '0.8'}
                onMouseOut={(e) => { e.target.style.opacity = '1'; e.target.style.transform = 'scale(1)'; }}
              >
                Allow Once
              </button>
              <button 
                onClick={() => onApprove('trust')} 
                style={{ 
                  padding: '2px 6px', 
                  fontSize: '0.7em',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: 400
                }}
                onMouseDown={(e) => e.target.style.transform = 'scale(0.95)'}
                onMouseUp={(e) => e.target.style.transform = 'scale(1)'}
                onMouseOver={(e) => e.target.style.background = 'var(--color-bg-secondary)'}
                onMouseOut={(e) => { e.target.style.background = 'var(--color-bg)'; e.target.style.transform = 'scale(1)'; }}
              >
                Always Allow
              </button>
              <button 
                onClick={() => onApprove('deny')} 
                style={{ 
                  padding: '2px 6px', 
                  fontSize: '0.7em',
                  background: 'var(--color-error)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: 400
                }}
                onMouseDown={(e) => e.target.style.transform = 'scale(0.95)'}
                onMouseUp={(e) => e.target.style.transform = 'scale(1)'}
                onMouseOver={(e) => e.target.style.opacity = '0.8'}
                onMouseOut={(e) => { e.target.style.opacity = '1'; e.target.style.transform = 'scale(1)'; }}
              >
                Deny
              </button>
            </>
          )}
          {toolCall.needsApproval && !toolCall.error && !toolCall.result && !toolCall.cancelled && <span style={{ color: 'orange' }}>⏸</span>}
          {toolCall.error && <span className="tool-call__error">⚠️</span>}
        </div>
        <div style={{ fontSize: '0.85em', opacity: 0.7, paddingLeft: '1rem', width: '100%', wordBreak: 'break-word', whiteSpace: 'normal' }}>{argsPreview}</div>
      </button>
      {isExpanded && (
        <div className="tool-call__details" style={{ marginTop: '0.5rem', fontSize: '0.9em' }}>
          <div className="tool-call__section" style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <span>
              <strong>ID:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{toolCall.id}</span>
            </span>
            {(toolCall.result || toolCall.error) && (
              <span>
                <strong>Status:</strong>{' '}
                <span style={{ color: toolCall.error ? 'var(--error-primary)' : 'var(--success-primary)' }}>
                  {toolCall.error ? 'Failed' : 'Success'}
                </span>
              </span>
            )}
          </div>
          <div className="tool-call__section">
            <strong>Arguments:</strong>
            <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '2px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(toolCall.args, null, 2)}</pre>
          </div>
          {toolCall.result && (
            <div className="tool-call__section">
              <strong>Response:</strong>
              <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '2px', overflowX: 'auto', maxHeight: '200px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(toolCall.result, null, 2)}</pre>
            </div>
          )}
          {toolCall.error && (
            <div className="tool-call__section tool-call__section--error">
              <strong>Error:</strong>
              <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '2px', overflowX: 'auto', color: 'var(--error-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{toolCall.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function App() {
  const { models: availableModels } = useAppData();
  const { apiBase: API_BASE } = useApiBase();
  const agents = useAgents(API_BASE);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/agent\/([^/]+)/);
    return match ? match[1] : null;
  });
  const workspaces = useWorkspaces(API_BASE);
  const [selectedWorkspace, setSelectedWorkspace] = useState<any | null>(null);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [agentSelectorModal, setAgentSelectorModal] = useState<{
    show: boolean;
    onSelect: (slug: string) => void;
  } | null>(null);
  
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('session');
  });
  
  const [ephemeralMessages, setEphemeralMessages] = useState<Record<string, ChatMessage[]>>({});
  const [streamingMessages, setStreamingMessages] = useState<Record<string, ChatMessage>>({});
  
  // Derive sessions from contexts (includes both backend conversations and draft sessions)
  const baseSessions = useDerivedSessions(API_BASE, selectedAgent);
  const { initChat, updateChat, clearInput, removeChat } = useActiveChatActions();
  const conversationActions = useConversationStatus(selectedAgent || '', activeSessionId || '');
  
  // Enrich the active session with full data (messages, status, UI state)
  const baseActiveSession = baseSessions.find(s => s.id === activeSessionId) || null;
  const enrichedActiveSession = useEnrichedSession(
    API_BASE,
    selectedAgent,
    activeSessionId,
    baseActiveSession
  );
  
  // Combine base sessions with enriched active session and ephemeral messages
  const sessions = useMemo(() => {
    const allSessions = enrichedActiveSession 
      ? baseSessions.map(s => s.id === activeSessionId ? enrichedActiveSession : s)
      : baseSessions;
    
    // Merge ephemeral messages into sessions (prepend so user message shows before streaming assistant message)
    return allSessions.map(s => {
      const ephemeral = ephemeralMessages[s.id];
      if (ephemeral && ephemeral.length > 0) {
        return { ...s, messages: [...ephemeral, ...s.messages] };
      }
      return s;
    });
  }, [baseSessions, enrichedActiveSession, activeSessionId, ephemeralMessages]);
  const [isDockCollapsed, setIsDockCollapsed] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('dock') !== 'open';
  });
  const isDockCollapsedRef = useRef(isDockCollapsed);
  const [isDockMaximized, setIsDockMaximized] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('maximize') === 'true';
  });
  const [dockHeight, setDockHeight] = useState(400);
  const [previousDockHeight, setPreviousDockHeight] = useState(400);
  const [previousDockCollapsed, setPreviousDockCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const appConfig = useConfig(API_BASE);
  const defaultFontSize = appConfig?.defaultChatFontSize ?? CONFIG_DEFAULTS.defaultChatFontSize;
  const [chatFontSize, setChatFontSize] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const querySize = params.get('fontSize');
    return querySize ? parseInt(querySize, 10) : CONFIG_DEFAULTS.defaultChatFontSize;
  });
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [managementNotice, setManagementNotice] = useState<string | null>(null);
  const workflowCatalog = useWorkflows(API_BASE);
  const { handleStreamEvent, clearStreamingMessage } = useStreamingMessage();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastSessionId, setToastSessionId] = useState<string | null>(null);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinDialogResolver, setPinDialogResolver] = useState<((success: boolean) => void) | null>(null);
  const [activeAbortController, setActiveAbortController] = useState<AbortController | null>(null);
  const { authenticate, isAuthenticating, error: authError } = useAwsAuth();
  const [currentView, setCurrentView] = useState<NavigationView>(() => {
    const path = window.location.pathname;
    
    if (path === '/settings') return { type: 'settings' };
    if (path === '/agents/new') return { type: 'agent-new' };
    if (path.startsWith('/agents/') && path.endsWith('/edit')) {
      const slug = path.split('/')[2];
      return { type: 'agent-edit', slug };
    }
    if (path.startsWith('/agents/') && path.endsWith('/tools')) {
      const slug = path.split('/')[2];
      return { type: 'tools', slug };
    }
    if (path.startsWith('/agents/') && path.endsWith('/workflows')) {
      const slug = path.split('/')[2];
      return { type: 'workflows', slug };
    }
    if (path === '/workspaces/new') return { type: 'workspace-new' };
    if (path.startsWith('/workspaces/') && path.endsWith('/edit')) {
      const slug = path.split('/')[2];
      return { type: 'workspace-edit', slug };
    }
    
    return { type: 'workspace' };
  });
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Listen for path changes (back/forward navigation)
  useEffect(() => {
    const handlePathChange = () => {
      const path = window.location.pathname;
      
      // Check path for main app navigation
      if (path === '/settings') {
        setCurrentView({ type: 'settings' });
        return;
      } else if (path === '/agents/new') {
        setCurrentView({ type: 'agent-new' });
        return;
      } else if (path.startsWith('/agents/') && path.endsWith('/edit')) {
        const slug = path.split('/')[2];
        setCurrentView({ type: 'agent-edit', slug });
        return;
      } else if (path.startsWith('/agents/') && path.endsWith('/tools')) {
        const slug = path.split('/')[2];
        setCurrentView({ type: 'tools', slug });
        return;
      } else if (path.startsWith('/agents/') && path.endsWith('/workflows')) {
        const slug = path.split('/')[2];
        setCurrentView({ type: 'workflows', slug });
        return;
      } else if (path === '/workspaces/new') {
        setCurrentView({ type: 'workspace-new' });
        return;
      } else if (path.startsWith('/workspaces/') && path.endsWith('/edit')) {
        const slug = path.split('/')[2];
        setCurrentView({ type: 'workspace-edit', slug });
        return;
      }
      
      // Parse workspace paths from URL (for workspace tab navigation)
      if (path.startsWith('/workspace/')) {
        const pathParts = path.split('/');
        const workspaceSlug = pathParts[2];
        const tabId = pathParts[3];
        
        if (workspaceSlug && workspaceSlug !== selectedWorkspace?.slug) {
          handleWorkspaceSelect(workspaceSlug, tabId);
        } else if (tabId && tabId !== activeTabId) {
          setActiveTabId(tabId);
        }
        setCurrentView({ type: 'workspace' });
        return;
      }
      
      // Default to workspace if no path matches
      setCurrentView({ type: 'workspace' });
    };

    handlePathChange(); // Initial call
    window.addEventListener('popstate', handlePathChange);
    return () => {
      window.removeEventListener('popstate', handlePathChange);
    };
  }, []);
  const [pendingPromptSend, setPendingPromptSend] = useState<{ sessionId: string; prompt: string } | null>(null);
  const [messageQueue, setMessageQueue] = useState<Map<string, string[]>>(new Map());
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');
  const [newChatSelectedIndex, setNewChatSelectedIndex] = useState(0);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generateId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? '⌘' : 'Ctrl+';

  const humanizeWorkflowId = (identifier: string) => {
    const base = identifier.includes('.') ? identifier.split('.')[0] : identifier;
    return base.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const showToast = (message: string, sessionId?: string) => {
    setToastMessage(message);
    setToastSessionId(sessionId || null);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      setToastSessionId(null);
      toastTimeoutRef.current = null;
    }, 5000);
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const [showScrollButtons, setShowScrollButtons] = useState({ left: false, right: false });
  const [showCommandAutocomplete, setShowCommandAutocomplete] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [modelSelectorDismissed, setModelSelectorDismissed] = useState(false);

  // Models are now provided by AppDataContext

  // Re-open model selector if input starts with /model 
  useEffect(() => {
    const activeSession = sessions.find(s => s.id === activeSessionId);
    if (activeSession?.input?.startsWith('/model ') && !showModelSelector && !modelSelectorDismissed) {
      setShowModelSelector(true);
      setSelectedModelIndex(0);
    } else if (activeSession?.input && !activeSession.input.startsWith('/model ')) {
      setShowModelSelector(false);
      setModelSelectorDismissed(false);
    }
  }, [sessions, activeSessionId, showModelSelector, modelSelectorDismissed]);

  const currentAgent = useMemo(
    () => agents.find((agent) => agent.slug === selectedAgent) ?? null,
    [agents, selectedAgent]
  );

  const slashCommands = useMemo(() => {
    const baseCommands = [
      { cmd: '/mcp', description: 'List MCP servers for this agent' },
      { cmd: '/tools', description: 'Show available tools and auto-approved list' },
      { cmd: '/model', description: 'List and select model for this conversation' },
      { cmd: '/prompts', description: 'List custom slash commands for this agent' },
      { cmd: '/clear', aliases: ['/new'], description: 'Clear conversation and start fresh' },
      { cmd: '/stats', description: 'Show conversation statistics' },
    ];

    // Add custom agent commands
    console.log('Building slash commands, currentAgent:', currentAgent?.slug, 'commands:', currentAgent?.commands);
    if (currentAgent?.commands) {
      const customCommands = Object.values(currentAgent.commands).map((cmd: any) => ({
        cmd: `/${cmd.name}`,
        description: cmd.description || 'Custom command',
        isCustom: true,
      }));
      console.log('Adding custom commands:', customCommands);
      return [...baseCommands, ...customCommands];
    }

    return baseCommands;
  }, [currentAgent]);

  const quickPrompts = currentAgent?.ui?.quickPrompts;
  const workflowShortcuts = currentAgent?.ui?.workflowShortcuts;
  const activeSession = activeSessionId
    ? sessions.find((session) => session.id === activeSessionId) ?? null
    : null;
  const unreadCount = sessions.filter((session) => session.hasUnread).length;

  // Setup auth callback
  useEffect(() => {
    const authCallback = async () => {
      return new Promise<boolean>((resolve) => {
        setPinDialogResolver(() => resolve);
        setShowPinDialog(true);
      });
    };
    
    setAuthCallback(authCallback);
    // Also expose globally for SDK
    (globalThis as any).authCallback = authCallback;
  }, []);

  const handlePinSubmit = async (pin: string) => {
    const success = await authenticate(pin);
    if (success) {
      setShowPinDialog(false);
      pinDialogResolver?.(true);
      setPinDialogResolver(null);
      // Refresh page after successful auth
      window.location.reload();
    }
    // Keep dialog open on failure to show error
  };

  const handlePinCancel = () => {
    setShowPinDialog(false);
    pinDialogResolver?.(false);
    setPinDialogResolver(null);
  };

  const handleAuthError = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      setPinDialogResolver(() => resolve);
      setShowPinDialog(true);
    });
  };

  // Update URL when state changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeSessionId) params.set('session', activeSessionId);
    if (!isDockCollapsed) params.set('dock', 'open');
    if (isDockMaximized) params.set('maximize', 'true');
    if (chatFontSize !== defaultFontSize) params.set('fontSize', String(chatFontSize));
    
    const query = params.toString();
    let path = '/';
    
    // Management views use path routing
    if (currentView.type === 'settings') {
      path = '/settings';
    } else if (currentView.type === 'agent-new') {
      path = '/agents/new';
    } else if (currentView.type === 'agent-edit') {
      path = `/agents/${currentView.slug}/edit`;
    } else if (currentView.type === 'workspace-new') {
      path = '/workspaces/new';
    } else if (currentView.type === 'workspace-edit') {
      path = `/workspaces/${currentView.slug}/edit`;
    } else if (currentView.type === 'tools') {
      path = `/agents/${currentView.slug}/tools`;
    } else if (currentView.type === 'workflows') {
      path = `/agents/${currentView.slug}/workflows`;
    } else if (currentView.type === 'workspace') {
      // Workspace views use path routing
      if (selectedWorkspace && activeTabId) {
        path = `/workspace/${selectedWorkspace.slug}/${activeTabId}`;
      } else if (selectedWorkspace) {
        path = `/workspace/${selectedWorkspace.slug}`;
      } else if (selectedAgent) {
        path = `/agent/${selectedAgent}`;
      }
    }
    
    const url = query ? `${path}?${query}` : path;
    
    window.history.pushState({}, '', url);
  }, [selectedAgent, activeSessionId, isDockCollapsed, isDockMaximized, chatFontSize, currentView]);

  // Keep ref in sync with state
  useEffect(() => {
    isDockCollapsedRef.current = isDockCollapsed;
  }, [isDockCollapsed]);

  // Sessions are loaded automatically via ConversationsContext

  useEffect(() => {
    if (pendingPromptSend) {
      const session = sessions.find(s => s.id === pendingPromptSend.sessionId);
      if (session) {
        sendMessage(pendingPromptSend.sessionId, pendingPromptSend.prompt);
        setPendingPromptSend(null);
      }
    }
  }, [sessions, pendingPromptSend]);

  useEffect(() => {
    // Agents auto-load via context
  }, []);

  // Sync font size from config
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('fontSize') && appConfig?.defaultChatFontSize) {
      setChatFontSize(defaultFontSize);
    }
  }, [appConfig, defaultFontSize]);

  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[sessions.length - 1].id);
    }
  }, [sessions, activeSessionId]);

  // Auto-update conversation title from first user message
  useEffect(() => {
    sessions.forEach(session => {
      // Only update if: has conversationId, exactly 2 messages, hasn't been auto-titled yet, and not from a prompt
      if (
        session.conversationId &&
        session.messages.length === 2 &&
        !session.hasAutoTitle &&
        session.source !== 'prompt'
      ) {
        const firstUserMsg = session.messages.find(m => m.role === 'user');
        if (firstUserMsg?.content) {
          const autoTitle = firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '');
          
          // Title will be updated via ConversationsContext after server update
          
          // Update on server
          fetch(`${API_BASE}/agents/${session.agentSlug}/conversations/${session.conversationId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: autoTitle }),
          }).catch(err => console.error('Failed to update conversation title:', err));
        }
      }
    });
  }, [sessions.map(s => `${s.id}:${s.messages.length}`).join(',')]);

  // Messages are loaded automatically via ConversationsContext in useEnrichedSession

  useEffect(() => {
    if (!activeSessionId || isDockCollapsed || isUserScrolledUp) return;
    const session = sessions.find((item) => item.id === activeSessionId);
    if (!session) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [
    activeSessionId, 
    sessions.find(s => s.id === activeSessionId)?.messages.length,
    sessions.find(s => s.id === activeSessionId)?.messages[sessions.find(s => s.id === activeSessionId)?.messages.length - 1]?.content,
    sessions.find(s => s.id === activeSessionId)?.status,
    sessions.find(s => s.id === activeSessionId)?.updatedAt,
    isDockCollapsed, 
    isUserScrolledUp
  ]);

  // Keyboard shortcuts for chat dock
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // Cmd/Ctrl + T: New chat
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        if (agents.length === 1) {
          openChatForAgent(agents[0]);
        } else {
          setShowNewChatModal(true);
          setNewChatSearch('');
          setNewChatSelectedIndex(0);
        }
      }
      // Cmd/Ctrl + O: Open conversation
      else if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        setShowSessionPicker(true);
      }
      // Cmd/Ctrl + ,: Toggle settings
      else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        if (currentView.type === 'settings') {
          navigateToWorkspace();
        } else {
          navigateToView({ type: 'settings' });
        }
      }
      // Cmd/Ctrl + N: New workspace
      else if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        navigateToView({ type: 'workspace-new' });
      }
      // Cmd/Ctrl + W: Open workspace dropdown (only on workspace view)
      else if ((e.metaKey || e.ctrlKey) && e.key === 'w' && currentView.type === 'workspace') {
        e.preventDefault();
        // Trigger workspace dropdown - we'll need to add a ref to WorkspaceSelector
        const workspaceButton = document.querySelector('.workspace-selector button') as HTMLButtonElement;
        workspaceButton?.click();
      }
      
      // Chat dock shortcuts - only work on workspace view
      if (currentView.type !== 'workspace') return;
      
      // Cmd/Ctrl + S: Toggle stats (only if dock is open and has active session)
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && !isDockCollapsed && activeSessionId) {
        e.preventDefault();
        setShowStatsPanel(prev => !prev);
      }
      // Cmd/Ctrl + X: Close active session
      else if ((e.metaKey || e.ctrlKey) && e.key === 'x' && activeSessionId) {
        e.preventDefault();
        removeSession(activeSessionId);
      }
      // Cmd/Ctrl + D: Toggle dock
      else if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        setIsDockCollapsed(prev => !prev);
      }
      // Cmd/Ctrl + M: Maximize dock
      else if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
        e.preventDefault();
        if (!isDockCollapsed) {
          setIsDockMaximized(prev => !prev);
        }
      }
      // Ctrl+C or Esc: Cancel active request
      else if ((e.ctrlKey && e.key === 'c') || e.key === 'Escape') {
        if (activeAbortController) {
          e.preventDefault();
          activeAbortController.abort();
          setActiveAbortController(null);
        }
      }
      // Cmd/Ctrl + 1-9: Switch to tab by number
      else if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (sessions[index]) {
          focusSession(sessions[index].id);
        }
      }
      // Cmd/Ctrl + [: Previous tab
      else if ((e.metaKey || e.ctrlKey) && e.key === '[') {
        e.preventDefault();
        if (isDockCollapsed) return;
        const currentIndex = sessions.findIndex(s => s.id === activeSessionId);
        if (currentIndex > 0) {
          focusSession(sessions[currentIndex - 1].id);
        }
      }
      // Cmd/Ctrl + ]: Next tab
      else if ((e.metaKey || e.ctrlKey) && e.key === ']') {
        e.preventDefault();
        if (isDockCollapsed) return;
        const currentIndex = sessions.findIndex(s => s.id === activeSessionId);
        if (currentIndex >= 0 && currentIndex < sessions.length - 1) {
          focusSession(sessions[currentIndex + 1].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSessionId, sessions, isDockCollapsed, activeAbortController, currentView, agents]);

  // Update scroll button visibility when sessions change
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
  }, [sessions]);

  useEffect(() => {
    if (!currentAgent) return;

    // Workflows auto-load via context

    if (currentAgent.workflowWarnings && currentAgent.workflowWarnings.length > 0) {
      const warningText = `Missing workflow shortcuts for ${currentAgent.name}: ${currentAgent.workflowWarnings.join(
        ', '
      )}`;
      setManagementNotice((prev) => prev ?? warningText);
    }
  }, [currentAgent]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isDockCollapsed && activeSessionId) {
      updateChat(activeSessionId, { hasUnread: false });
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [isDockCollapsed, activeSessionId, updateChat]);

  useEffect(() => {
    if (!isDragging) return;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY;
      setDockHeight(Math.max(200, Math.min(newHeight, window.innerHeight * 0.8)));
      // Un-maximize when user resizes
      if (isDockMaximized) {
        setIsDockMaximized(false);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, isDockMaximized]);

  // Auto-select first agent if none selected
  useEffect(() => {
    if (agents.length > 0 && !selectedAgent) {
      setSelectedAgent(agents[0].slug);
    }
  }, [agents, selectedAgent]);

  // Sync active session status to ConversationsContext
  const { setStatus: setConversationStatus } = useConversationStatus(
    activeSession?.agentSlug || '',
    activeSession?.conversationId || ''
  );

  useEffect(() => {
    if (activeSession?.agentSlug && activeSession?.conversationId) {
      const status = activeSession.status === 'sending' ? 'streaming' : 'idle';
      setConversationStatus(status);
    }
  }, [activeSession?.status, activeSession?.agentSlug, activeSession?.conversationId, setConversationStatus]);

  const handleWorkspaceSelect = async (slug: string, preferredTabId?: string) => {
    try {
      const response = await fetch(`${API_BASE}/workspaces/${slug}`);
      const data = await response.json();
      if (data.success) {
        setSelectedWorkspace(data.data);
        
        // Use preferred tab ID if provided and valid, otherwise use first tab
        const validTabId = preferredTabId && data.data.tabs.find((t: any) => t.id === preferredTabId)
          ? preferredTabId 
          : data.data.tabs[0]?.id || '';
        
        setActiveTabId(validTabId);
        
        // Update URL
        const newPath = `/workspace/${slug}${validTabId ? `/${validTabId}` : ''}`;
        window.history.replaceState(null, '', newPath + window.location.search);
      }
    } catch (error) {
      console.error('Failed to load workspace:', error);
    }
  };

  const handleTabChange = (tabId: string) => {
    setActiveTabId(tabId);
    // Update URL
    if (selectedWorkspace) {
      const newPath = `/workspace/${selectedWorkspace.slug}/${tabId}`;
      window.history.replaceState(null, '', newPath + window.location.search);
    }
  };

  // Sessions are loaded automatically via ConversationsContext in useDerivedSessions

  const removeSession = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    
    // Only cancel ongoing request if this session is currently sending
    if (activeAbortController && session?.status === 'sending') {
      console.log('Cancelling ongoing request for session:', sessionId);
      activeAbortController.abort();
      setActiveAbortController(null);
    }
    
    // Remove from ActiveChatsContext
    removeChat(sessionId);
    
    // Switch to another session if this was active
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter(s => s.id !== sessionId);
      const next = remaining[remaining.length - 1]?.id ?? null;
      setActiveSessionId(next);
    }
  };

  const focusSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setIsDockCollapsed(false);
    setHistoryIndex(-1);
    setShowModelSelector(false);
    setShowCommandAutocomplete(false);
    updateChat(sessionId, { hasUnread: false });
    setTimeout(() => {
      chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 0);
  };

  const createChatSession = (
    agent: AgentSummary,
    options: { title?: string; source: ChatSession['source']; sourceId?: string; conversationId?: string }
  ) => {
    const sessionId = options.conversationId || `${agent.slug}:${generateId()}`;
    const title = options.title || `${agent.name} Chat`;
    
    // Initialize UI state in ActiveChatsContext with metadata
    initChat(sessionId, {
      agentSlug: agent.slug,
      agentName: agent.name,
      title,
    });
    
    // Return a minimal session object for immediate use
    const session: ChatSession = {
      id: sessionId,
      conversationId: sessionId,
      agentSlug: agent.slug,
      agentName: agent.name,
      title,
      source: options.source,
      sourceId: options.sourceId,
      messages: [],
      input: '',
      attachments: [],
      queuedMessages: [],
      status: 'idle',
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hasUnread: false,
      inputHistory: [],
    };

    return session;
  };

  const ensureManualSession = (agent: AgentSummary) => {
    // Always create a new session for "New Chat"
    const session = createChatSession(agent, { source: 'manual', title: `${agent.name} Chat` });
    focusSession(session.id);
    return session;
  };

  const setSessionInput = (sessionId: string, value: string) => {
    updateChat(sessionId, { input: value });
    
    // Reset dismissed flag when user types after /model 
    if (value.startsWith('/model ') && value.length > 7) {
      setModelSelectorDismissed(false);
    }
    
    // Show autocomplete when typing slash commands
    if (value.startsWith('/') && !value.includes(' ')) {
      setShowCommandAutocomplete(true);
      setSelectedCommandIndex(0);
    } else {
      setShowCommandAutocomplete(false);
    }
  };

  const handleSlashCommand = async (sessionId: string, command: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;

    // Scroll to bottom if user was scrolled up
    setIsUserScrolledUp(false);

    const parts = command.slice(1).trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    // Check for custom agent commands first
    const agent = agents.find(a => a.slug === session.agentSlug);
    console.log('Checking for custom command:', cmd, 'Agent:', agent?.slug, 'Commands:', agent?.commands);
    if (agent?.commands && agent.commands[cmd]) {
      console.log('Found custom command:', agent.commands[cmd]);
      const customCmd = agent.commands[cmd];
      const args = parts.slice(1);
      
      // Parse parameters and expand template
      let expandedPrompt = customCmd.prompt;
      const params = customCmd.params || [];
      
      params.forEach((param, idx) => {
        const value = args[idx] || param.default || '';
        expandedPrompt = expandedPrompt.replace(new RegExp(`{{${param.name}}}`, 'g'), value);
      });
      
      // Send expanded prompt as regular message
      updateChat(sessionId, { input: expandedPrompt });
      await sendMessage(sessionId, expandedPrompt);
      return;
    }

    let responseContent = '';

    if (cmd === 'mcp') {
      try {
        // Get agent's tools to find which MCP servers are loaded
        const response = await fetch(`${API_BASE}/agents/${session.agentSlug}`);
        const data = await response.json();
        const agent = data.data;
        
        const tools = agent?.tools || [];
        
        // Extract unique MCP server names (prefix before underscore)
        const mcpServers = [...new Set(
          tools
            .map((t: any) => {
              const name = typeof t === 'string' ? t : (t.name || t.id || '');
              // Extract server name (e.g., "sat-outlook" from "sat-outlook_email_read")
              return name.includes('_') ? name.split('_')[0] : null;
            })
            .filter((s: string | null) => s !== null)
        )].sort();
        
        if (mcpServers.length > 0) {
          responseContent = `**MCP Servers (${mcpServers.length}):**\n\n${mcpServers.map((s: string) => `- ${s}`).join('\n')}`;
        } else {
          responseContent = `No MCP servers loaded for this agent.`;
        }
      } catch (error) {
        responseContent = `Error: ${error}`;
      }
    } else if (cmd === 'tools') {
      try {
        // Get agent from state (already has tools config from /api/agents)
        const agent = agents.find(a => a.slug === session.agentSlug);
        console.log('[/tools] Agent found:', !!agent);
        console.log('[/tools] Agent:', JSON.stringify(agent, null, 2));
        console.log('[/tools] Agent toolsConfig:', agent?.toolsConfig);
        console.log('[/tools] All agents:', agents.map(a => ({ slug: a.slug, hasToolsConfig: !!a.toolsConfig })));
        if (!agent) {
          responseContent = 'Agent not found';
        } else {
          // Fetch VoltAgent tools list
          const response = await fetch(`${API_BASE}/agents/${session.agentSlug}`);
          const data = await response.json();
          const voltAgentData = data.data;
          
          const tools = voltAgentData?.tools || [];
          const autoApproveList = agent.toolsConfig?.autoApprove || [];
          console.log('[/tools] autoApproveList:', autoApproveList);
        
        if (tools.length > 0) {
          // Sort alphabetically
          const sortedTools = [...tools].sort((a: any, b: any) => {
            const nameA = typeof a === 'string' ? a : (a.name || a.id || '');
            const nameB = typeof b === 'string' ? b : (b.name || b.id || '');
            return nameA.localeCompare(nameB);
          });
          
          const toolLines = sortedTools.map((t: any) => {
            const name = typeof t === 'string' ? t : (t.name || t.id || 'unknown');
            console.log('[/tools] Checking tool:', name, 'against autoApprove:', autoApproveList);
            const isAutoApproved = autoApproveList.includes(name) || autoApproveList.some((pattern: string) => {
              if (pattern.includes('*')) {
                const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                const matches = regex.test(name);
                console.log('[/tools] Pattern match:', pattern, 'vs', name, '=', matches);
                return matches;
              }
              const exactMatch = pattern === name;
              console.log('[/tools] Exact match:', pattern, 'vs', name, '=', exactMatch);
              return exactMatch;
            });
            const trusted = isAutoApproved ? '✓' : '';
            console.log('[/tools] Tool', name, 'isAutoApproved:', isAutoApproved, 'trusted:', trusted);
            
            // Get parameters with * for optional, required first
            let params = '';
            if (t.parameters?.properties) {
              const required = t.parameters.required || [];
              const allParams = Object.keys(t.parameters.properties);
              // Sort: required first, then optional
              const sortedParams = [
                ...allParams.filter(p => required.includes(p)),
                ...allParams.filter(p => !required.includes(p))
              ];
              const paramNames = sortedParams.map(p => 
                required.includes(p) ? p : `${p}*`
              );
              params = paramNames.length > 0 ? paramNames.join(', ') : 'none';
            }
            
            // Clean up and truncate description to ~200 chars (roughly 2-3 lines)
            let desc = t.description || 'No description';
            desc = desc.replace(/\s+/g, ' ').replace(/^#+\s*/g, '').trim();
            if (desc.length > 200) {
              desc = desc.substring(0, 197) + '...';
            }
            
            return `| ${name} | ${desc} | ${params} | ${trusted} |`;
          });
          
          responseContent = `**Tools (${tools.length}):**\n\n| Tool | Description | Parameters (* optional) | Trusted |\n|------|-------------|-------------------------|:-------:|\n${toolLines.join('\n')}`;
        } else {
          responseContent = `No tools configured.`;
        }
        }
      } catch (error) {
        responseContent = `Error: ${error}`;
      }
    } else if (cmd === 'model') {
      // Show model selector menu
      const session = sessions.find(s => s.id === sessionId);
      const currentModelIndex = session?.model 
        ? availableModels.findIndex(m => m.id === session.model)
        : 0;
      
      updateChat(sessionId, { input: '' });
      
      setShowModelSelector(true);
      setSelectedModelIndex(currentModelIndex >= 0 ? currentModelIndex : 0);
      return;
    } else if (cmd === 'clear' || cmd === 'new') {
      // Clear conversation by generating new conversationId
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        const newConversationId = `tauri-${session.agentSlug}-${generateId()}`;
        updateChat(sessionId, { input: '' });
        setEphemeralMessages(prev => ({
          ...prev,
          [sessionId]: [{ role: 'system', content: 'Conversation cleared. Starting fresh with new history.' }]
        }));
      }
      return;
    } else if (cmd === 'stats') {
      setShowStatsPanel(true);
      updateChat(sessionId, { input: '' });
      return;
    } else if (cmd === 'prompts') {
      const agent = agents.find(a => a.slug === session.agentSlug);
      if (agent?.commands && Object.keys(agent.commands).length > 0) {
        const commandList = Object.values(agent.commands).map((cmd: any) => {
          const params = cmd.params?.map((p: any) => 
            `${p.name}${p.required === false ? '?' : ''}`
          ).join(' ') || '';
          return `• **/${cmd.name}** ${params ? `\`${params}\`` : ''}\n  ${cmd.description || 'No description'}`;
        }).join('\n\n');
        responseContent = `**Custom Slash Commands (${Object.keys(agent.commands).length})**\n\n${commandList}`;
      } else {
        responseContent = `No custom slash commands defined for this agent.\n\n[MANAGE_COMMANDS:${session.agentSlug}]`;
      }
      updateChat(sessionId, { input: '' });
    } else {
      responseContent = `Unknown command: ${command}\n\nAvailable:\n• /mcp - List MCP servers\n• /tools - Show tools\n• /model - Change model\n• /prompts - List custom commands\n• /clear or /new - Clear conversation\n• /stats - Show conversation statistics`;
    }

    // Set ephemeral message (shows in UI but not in history)
    setEphemeralMessages(prev => ({
      ...prev,
      [sessionId]: [{ role: 'assistant', content: responseContent }]
    }));
    
    // Clear input
    updateChat(sessionId, { input: '' });
  };

  const sendMessage = async (sessionId: string, overrideContent?: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;

    const text = (overrideContent ?? session.input).trim();
    const hasAttachments = session.attachments && session.attachments.length > 0;
    
    if (!text && !hasAttachments) return;

    // Handle slash commands (only if no attachments)
    if (text.startsWith('/') && !hasAttachments) {
      await handleSlashCommand(sessionId, text);
      return;
    }

    // If already sending, queue the message
    if (session.status === 'sending') {
      const current = sessions.find(s => s.id === sessionId);
      if (current) {
        updateChat(sessionId, { 
          input: overrideContent ? current.input : '', 
          queuedMessages: [...(current.queuedMessages || []), text],
          inputHistory: [...current.inputHistory, text]
        });
      }
      return;
    }

    // Add to input history only when actually sending (not when queued)
    updateChat(sessionId, { inputHistory: [...session.inputHistory, text] });

    // Create conversationId on first message if it doesn't exist
    if (!session.conversationId) {
      const newConversationId = `tauri-${session.agentSlug}-${generateId()}`;
      // REMOVED: updateSession - data comes from ConversationsContext
      // Update session reference
      session.conversationId = newConversationId;
    }

    // Construct multi-modal message
    const userMessage: ChatMessage = { 
      role: 'user', 
      content: text,
      attachments: hasAttachments ? [...session.attachments!] : undefined,
    };

    // Add user message to ephemeral (will show immediately)
    setEphemeralMessages(prev => ({
      ...prev,
      [sessionId]: [userMessage]
    }));

    // Clear input and attachments
    updateChat(sessionId, { input: '', attachments: [], hasUnread: false, error: null });
    focusSession(sessionId);

    const abortController = new AbortController();
    setActiveAbortController(abortController);

    try {
      // Get agent to check if model override is needed
      const agent = agents.find(a => a.slug === session.agentSlug);
      const agentModelId = typeof agent?.model === 'string' ? agent.model : agent?.model?.modelId;
      const needsModelOverride = session.model && session.model !== agentModelId;

      // Construct input for API - either string or multi-modal message array
      let apiInput: string | any[];
      
      if (hasAttachments) {
        // Build multi-modal message with content parts
        const contentParts: any[] = [];
        
        if (text) {
          contentParts.push({ type: 'text', text });
        }
        
        for (const att of session.attachments!) {
          if (att.type.startsWith('image/')) {
            contentParts.push({
              type: 'image',
              image: att.data,
              mediaType: att.type,
            });
          } else {
            contentParts.push({
              type: 'file',
              url: att.data,
              mediaType: att.type,
            });
          }
        }
        
        apiInput = [{
          role: 'user',
          content: contentParts,
        }];
      } else {
        apiInput = text;
      }

      // Use streaming /chat endpoint to see tool calls
      const response = await fetch(`${API_BASE}/api/agents/${session.agentSlug}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          input: apiInput,
          options: {
            userId: 'tauri-ui-user',
            conversationId: session.conversationId,
            maxSteps: 10,
            ...(needsModelOverride && { model: session.model }),
          },
        }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          const retry = await handleAuthError();
          if (retry) {
            // Retry the request
            return sendMessage(sessionId, text);
          }
        }
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
        
        console.error('[Chat Error]', { status: response.status, errorMessage, errorData });
        throw new Error(errorMessage);
      }

      // Stream SSE response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let contentParts: Array<{ type: 'text' | 'tool'; content?: string; tool?: any }> = [];
      let currentTextChunk = '';
      let stepCount = 0;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim() || !line.startsWith('data: ')) continue;
            
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            
            try {
              const data = JSON.parse(dataStr);
              console.log('[SSE Event]', data.type, data);
              
              // Handle error events from server
              if (data.type === 'error') {
                const errorMsg = data.error || data.errorText || 'Unknown error occurred';
                console.error('[SSE Error]', errorMsg);
                
                updateChat(sessionId, { error: errorMsg });
                
                setActiveAbortController(null);
                return;
              }
              
              // Handle streaming events
              const result = handleStreamEvent(sessionId, data, { currentTextChunk, contentParts });
              if (result.updated) {
                currentTextChunk = result.currentTextChunk;
                contentParts = result.contentParts;
              }
              
              if (data.type === 'finish' && data.finishReason === 'tool-calls') {
                // When finish reason is tool-calls, it means maxSteps was reached
                // Message will be added via ConversationsContext
              } else if (data.type === 'tool-output-available') {
                console.log('[Tool Output]', data);
                
                // Check for auth errors in tool output
                const outputStr = JSON.stringify(data.output || data.error || data);
                const needsAuth = outputStr.includes('Form action URL not found') || 
                                  outputStr.includes('Midway') || 
                                  outputStr.includes('authentication failed') ||
                                  outputStr.includes('mwinit') ||
                                  outputStr.includes('status code 403') ||
                                  outputStr.includes('Request failed with status code 403');
                
                if (needsAuth) {
                  console.log('[Auth Error Detected] Showing PIN dialog');
                  // Trigger auth flow
                  const success = await handleAuthError();
                  if (success) {
                    console.log('[Auth Success] Retrying message');
                    // Retry the message
                    return sendMessage(sessionId, text);
                  }
                }
                
                // Update tool result
      // REMOVED: updateSession - data comes from ConversationsContext
              } else if (data.type === 'tool-result') {
                // VoltAgent native tool-result event with output
                console.log('[Handling tool-result]', { toolCallId: data.toolCallId, hasOutput: !!data.output });
      // REMOVED: updateSession - data comes from ConversationsContext
              } else if (data.type === 'ephemeral-message') {
                console.log('[Ephemeral Message]', data);
                
                // Add ephemeral message to UI
      // REMOVED: updateSession - data comes from ConversationsContext
              } else if (data.type === 'tool-approval-request') {
                console.log('[Tool Approval Request]', data);
                
                // Add pending tool call to UI
      // REMOVED: updateSession - data comes from ConversationsContext
              }
            } catch (e) {
              console.error('Failed to parse SSE chunk:', e);
            }
          }
        }
      }

      // Get current dock state at completion time (not from closure)
      const currentDockCollapsed = isDockCollapsedRef.current;
      
      const shouldMarkUnread = sessionId !== activeSessionId || currentDockCollapsed;
      const shouldShowToast = sessionId !== activeSessionId || currentDockCollapsed;
      
      console.log('[Toast Debug]', { 
        sessionId, 
        activeSessionId, 
        isDockCollapsedFromClosure: isDockCollapsed,
        currentDockCollapsed,
        shouldMarkUnread,
        shouldShowToast,
        sessionTitle: session.title 
      });

      updateChat(sessionId, { 
        hasUnread: shouldMarkUnread, 
        error: null
      });
      clearStreamingMessage(sessionId);
      
      // Clear ephemeral messages (user message now in backend)
      setEphemeralMessages(prev => {
        const updated = { ...prev };
        delete updated[sessionId];
        return updated;
      });
      
      setActiveAbortController(null);

      if (shouldShowToast) {
        const sessionIndex = sessions.findIndex(s => s.id === sessionId);
        const shortcut = sessionIndex >= 0 && sessionIndex < 9 ? ` (⌘${sessionIndex + 1})` : '';
        const toastMsg = `New response from ${session.agentName} (${session.title})${shortcut}`;
        console.log('[Showing Toast]', toastMsg);
        showToast(toastMsg, sessionId);
      }
    } catch (err: any) {
      setActiveAbortController(null);
      
      if (err.name === 'AbortError') {
      // REMOVED: updateSession - data comes from ConversationsContext
        setEphemeralMessages(prev => ({
          ...prev,
          [sessionId]: [{ role: 'system', content: 'Request cancelled' }]
        }));
        return;
      }
      
      const errorMessage = err?.message || 'Failed to send message';
      
      console.error('[sendMessage Error]', { errorMessage, sessionId, err });
      
      // Check for Gateway authentication errors
      const needsAuth = errorMessage.includes('AI Gateway authentication failed') ||
                        errorMessage.includes('No authentication provided') ||
                        errorMessage.includes('Vercel AI Gateway access failed') ||
                        errorMessage.includes('status code 403') ||
                        errorMessage.includes('Request failed with status code 403') ||
                        errorMessage.includes('Outlook authentication failed') ||
                        errorMessage.includes('Midway');
      
      if (needsAuth) {
        console.log('[Gateway Auth Error Detected] Showing PIN dialog');
        const success = await handleAuthError();
        if (success) {
          console.log('[Auth Success] Retrying message');
          return sendMessage(sessionId, text);
        }
      }
      
      const shouldMarkUnread = sessionId !== activeSessionId || isDockCollapsed;
      console.log('[Setting Error State]', { sessionId, errorMessage, shouldMarkUnread });
      updateChat(sessionId, { hasUnread: shouldMarkUnread, error: errorMessage });
      if (shouldMarkUnread) {
        showToast(`Message failed for ${session.agentName} (${session.title})`, sessionId);
      }
    }
  };

  const getFilteredCommands = () => {
    if (!activeSession) return slashCommands;
    const input = activeSession.input.toLowerCase();
    if (!input.startsWith('/')) return slashCommands;
    return slashCommands.filter(c => 
      c.cmd.toLowerCase().startsWith(input) || 
      c.aliases?.some(a => a.toLowerCase().startsWith(input))
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle model selector navigation
    if (showModelSelector) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const filteredModels = availableModels.filter((model) => {
          if (!activeSession?.input) return true;
          const query = activeSession.input.replace('/model ', '').toLowerCase();
          return model.name.toLowerCase().includes(query) || 
                 model.id.toLowerCase().includes(query);
        }).slice(0, 10);
        setSelectedModelIndex((prev) => {
          const next = (prev + 1) % filteredModels.length;
          // Scroll to selected item
          setTimeout(() => {
            const selected = document.querySelector('.command-autocomplete .command-item.selected');
            selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }, 0);
          return next;
        });
        return;
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const filteredModels = availableModels.filter((model) => {
          if (!activeSession?.input) return true;
          const query = activeSession.input.replace('/model ', '').toLowerCase();
          return model.name.toLowerCase().includes(query) || 
                 model.id.toLowerCase().includes(query);
        }).slice(0, 10);
        setSelectedModelIndex((prev) => {
          const next = (prev - 1 + filteredModels.length) % filteredModels.length;
          // Scroll to selected item
          setTimeout(() => {
            const selected = document.querySelector('.command-autocomplete .command-item.selected');
            selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }, 0);
          return next;
        });
        return;
      } else if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        if (activeSessionId) {
          const filteredModels = availableModels.filter((model) => {
            if (!activeSession?.input) return true;
            const query = activeSession.input.replace('/model ', '').toLowerCase();
            return model.name.toLowerCase().includes(query) || 
                   model.id.toLowerCase().includes(query);
          }).slice(0, 10);
          const selectedModel = filteredModels[selectedModelIndex];
          if (selectedModel) {
            const agent = agents.find(a => a.slug === activeSession?.agentSlug) || currentAgent;
            const agentModelId = typeof agent?.model === 'string' ? agent.model : agent?.model?.modelId;
            const currentModel = activeSession?.model || agentModelId;
            const normalizeId = (id: string) => id?.replace(/^us\./, '') || '';
            const isAlreadyActive = normalizeId(currentModel) === normalizeId(selectedModel.id) || currentModel === selectedModel.id;
            
            updateChat(activeSessionId, { input: '', inputHistory: [...current.inputHistory, `/model ${selectedModel.name}`] });
            setShowModelSelector(false);
          }
        }
        return;
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setShowModelSelector(false);
        setModelSelectorDismissed(true);
        return;
      }
    }

    // Handle autocomplete navigation
    if (showCommandAutocomplete) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const filtered = getFilteredCommands();
        setSelectedCommandIndex((prev) => (prev + 1) % filtered.length);
        return;
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const filtered = getFilteredCommands();
        setSelectedCommandIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
        return;
      } else if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        const filtered = getFilteredCommands();
        if (filtered.length > 0 && activeSessionId) {
          const selectedCmd = filtered[selectedCommandIndex].cmd;
          setShowCommandAutocomplete(false);
          
          // If selecting /model, insert it with space to trigger model selector
          if (selectedCmd === '/model') {
            updateChat(activeSessionId, { input: '/model ' });
            setShowModelSelector(true);
            setSelectedModelIndex(0);
          } else {
            sendMessage(activeSessionId, selectedCmd);
          }
        } else if (event.key === 'Enter' && activeSessionId) {
          // No matching commands, just send the message as-is
          setShowCommandAutocomplete(false);
          sendMessage(activeSessionId);
        }
        return;
      } else if (event.key === 'Escape') {
        setShowCommandAutocomplete(false);
        return;
      }
    }

    // Ctrl+C to clear input (only if no text is selected)
    if ((event.ctrlKey || event.metaKey) && event.key === 'c' && activeSessionId) {
      const selection = window.getSelection();
      if (!selection || selection.toString().length === 0) {
        event.preventDefault();
        updateChat(activeSessionId, { input: '' });
        setShowModelSelector(false);
        setShowCommandAutocomplete(false);
        return;
      }
    }

    // Handle backspace in model selector to go back to command autocomplete
    if (showModelSelector && event.key === 'Backspace') {
      if (activeSession?.input === '/model ') {
        event.preventDefault();
        updateChat(activeSessionId!, { input: '/model' });
        setShowModelSelector(false);
        setShowCommandAutocomplete(true);
        setSelectedCommandIndex(0);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (activeSessionId) {
        setShowCommandAutocomplete(false);
        sendMessage(activeSessionId);
        setHistoryIndex(-1);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!activeSession) return;
      if (activeSession.inputHistory.length === 0) return;
      const newIndex = historyIndex + 1;
      if (newIndex < activeSession.inputHistory.length) {
        setHistoryIndex(newIndex);
        setSessionInput(activeSession.id, activeSession.inputHistory[activeSession.inputHistory.length - 1 - newIndex]);
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!activeSession) return;
      const newIndex = historyIndex - 1;
      if (newIndex >= 0) {
        setHistoryIndex(newIndex);
        setSessionInput(activeSession.id, activeSession.inputHistory[activeSession.inputHistory.length - 1 - newIndex]);
      } else if (newIndex === -1) {
        setHistoryIndex(-1);
        setSessionInput(activeSession.id, '');
      }
    }
  };

  const switchAgent = (slug: string) => {
    setSelectedAgent(slug);
    setManagementNotice(null);
  };

  const handleSendToChat = useCallback((text: string, agentSlug?: string, promptLabel?: string) => {
    console.log('handleSendToChat called with:', { text, agentSlug, promptLabel, agents: agents.map(a => a.slug) });
    
    if (!agentSlug) {
      console.log('No agent slug provided!');
      return;
    }
    
    const targetAgent = agents.find(a => a.slug === agentSlug);
    console.log('Target agent:', targetAgent);
    if (!targetAgent) {
      console.log('No target agent found!');
      return;
    }
    // Always create a new session for prompts to ensure clean context
    const title = promptLabel || `${targetAgent.name} Chat`;
    const session = createChatSession(targetAgent, { 
      source: promptLabel ? 'prompt' : 'manual', 
      title 
    });
    console.log('New session created:', session.id);
    focusSession(session.id);
    setSessionInput(session.id, text);
    setPendingPromptSend({ sessionId: session.id, prompt: text });
    console.log('Pending prompt set');
  }, [agents]);

  const handleLaunchPrompt = useCallback((prompt: AgentQuickPrompt) => {
    if (!currentAgent) return;

    const sessionId = `${currentAgent.slug}:${generateId()}`;
    const conversationId = `tauri-${currentAgent.slug}-${generateId()}`;
    const session: ChatSession = {
      id: sessionId,
      conversationId,
      agentSlug: currentAgent.slug,
      agentName: currentAgent.name,
      title: prompt.label,
      source: 'prompt',
      sourceId: prompt.id,
      messages: [],
      input: '',
      status: 'idle',
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hasUnread: false,
    };

    // Session will appear in derived sessions after first message
    setActiveSessionId(sessionId);
    setIsDockCollapsed(false);
    setPendingPromptSend({ sessionId, prompt: prompt.prompt });
  }, [currentAgent]);

  const handlePromptSelect = useCallback((prompt: any) => {
    console.log('handlePromptSelect called with:', prompt);
    if (prompt.agent) {
      console.log('Sending to agent:', prompt.agent);
      handleSendToChat(prompt.prompt, prompt.agent, prompt.label);
    } else {
      console.log('No agent specified, showing selector');
      setAgentSelectorModal({
        show: true,
        onSelect: (agentSlug) => {
          setAgentSelectorModal(null);
          handleSendToChat(prompt.prompt, agentSlug, prompt.label);
        }
      });
    }
  }, [handleSendToChat]);

  const handleWorkflowShortcut = (workflowId: string) => {
    if (!currentAgent) return;

    const existing = sessions.find(
      (session) =>
        session.agentSlug === currentAgent.slug &&
        session.source === 'workflow' &&
        session.sourceId === workflowId
    );

    if (existing) {
      focusSession(existing.id);
      return;
    }

    const workflowsForAgent = workflowCatalog[currentAgent.slug] || [];
    const workflowLabel =
      workflowsForAgent.find((item) => item.id === workflowId)?.label || humanizeWorkflowId(workflowId);
    const session = createChatSession(currentAgent, {
      source: 'workflow',
      sourceId: workflowId,
      title: `Workflow · ${workflowLabel}`,
    });
    focusSession(session.id);

    setTimeout(() => {
      sendMessage(
        session.id,
        `Please run workflow "${workflowLabel}" (${workflowId}).`
      );
    }, 0);
  };

  const navigateToView = (view: NavigationView) => {
    setCurrentView(view);
    setManagementNotice(null);
    
    // Update path for routing (not hash)
    switch (view.type) {
      case 'workspace':
        window.history.pushState(null, '', '/');
        break;
      case 'settings':
        window.history.pushState(null, '', '/settings');
        break;
      case 'agent-new':
        window.history.pushState(null, '', '/agents/new');
        break;
      case 'agent-edit':
        window.history.pushState(null, '', `/agents/${view.slug}/edit`);
        break;
      case 'workspace-new':
        window.history.pushState(null, '', '/workspaces/new');
        break;
      case 'workspace-edit':
        window.history.pushState(null, '', `/workspaces/${view.slug}/edit`);
        break;
      case 'tools':
        window.history.pushState(null, '', `/agents/${view.slug}/tools`);
        break;
      case 'workflows':
        window.history.pushState(null, '', `/agents/${view.slug}/workflows`);
        break;
    }
  };

  const navigateToWorkspace = () => {
    navigateToView({ type: 'workspace' });
  };

  const handleCreateAgentAction = () => {
    navigateToView({ type: 'agent-new' });
  };

  const handleEditAgentAction = (slug: string) => {
    navigateToView({ type: 'agent-edit', slug });
  };

  const handleManageToolsAction = (slug: string) => {
    navigateToView({ type: 'tools', slug });
  };

  const handleManageWorkflowsAction = (slug: string) => {
    navigateToView({ type: 'workflows', slug });
  };

  const handleAgentSaved = async (slug: string) => {
    // Agents auto-update via context
    setSelectedAgent(slug);
    navigateToWorkspace();
    showToast('Agent saved successfully');
  };

  const handleWorkspaceSaved = async (slug: string) => {
    // Workspaces auto-update via context
    navigateToWorkspace();
    showToast('Workspace saved successfully');
  };

  const handleSettingsSaved = () => {
    showToast('Settings saved successfully');
  };

  const openChatForAgent = useCallback((agent: AgentSummary | null) => {
    if (!agent) return;
    ensureManualSession(agent);
  }, [sessions]);

  const openConversation = async (conversationId: string, agentSlug: string) => {
    // Check if already open
    const existing = sessions.find(s => s.conversationId === conversationId);
    if (existing) {
      focusSession(existing.id);
      return;
    }

    // Load conversation
    const agent = agents.find(a => a.slug === agentSlug);
    if (!agent) return;

    try {
      const response = await fetch(`${API_BASE}/agents/${agentSlug}/conversations/${conversationId}/messages`);
      if (response.ok) {
        const payload = await response.json();
        const rawMessages = payload.data || [];
        
        // Transform messages from VoltAgent format
        const messages = rawMessages.map((msg: any) => {
          const textParts = msg.parts?.filter((p: any) => p.type === 'text') || [];
          const toolParts = msg.parts?.filter((p: any) => p.type === 'tool-call') || [];
          const content = textParts.map((p: any) => p.text).join('');
          
          const contentParts = [
            ...textParts.map((p: any) => ({ type: 'text' as const, content: p.text })),
            ...toolParts.map((p: any) => ({ 
              type: 'tool' as const, 
              tool: {
                id: p.toolCallId,
                name: p.toolName,
                args: p.args,
                result: p.result
              }
            }))
          ];
          
          return {
            role: msg.role,
            content,
            contentParts: contentParts.length > 0 ? contentParts : undefined
          };
        });
        
        // Get conversation metadata for title
        const convResponse = await fetch(`${API_BASE}/agents/${agentSlug}/conversations`);
        let conversationTitle = `${agent.name} Chat`;
        if (convResponse.ok) {
          const convData = await convResponse.json();
          const conv = (convData.data || []).find((c: any) => c.id === conversationId);
          if (conv?.title) {
            conversationTitle = conv.title;
          }
        }
        
        const sessionId = `${agentSlug}:${generateId()}`;
        const session: ChatSession = {
          id: sessionId,
          conversationId,
          agentSlug,
          agentName: agent.name,
          title: conversationTitle,
          messages,
          input: '',
          status: 'idle',
          source: 'manual',
          hasUnread: false,
          inputHistory: [],
          historyIndex: -1,
        };
        
        // Session will appear in derived sessions from ConversationsContext
        focusSession(sessionId);
      }
    } catch (error) {
      console.error('Failed to open conversation:', error);
      showToast('Failed to open conversation');
    }
  };

  const handleShowChatForCurrentAgent = useCallback(() => {
    openChatForAgent(currentAgent);
  }, [currentAgent, openChatForAgent]);

  // Render management views
  if (currentView.type !== 'workspace') {
    return (
      <div className="app">
        <Header
          workspaces={workspaces}
          selectedWorkspace={selectedWorkspace}
          currentView={currentView}
          onWorkspaceSelect={handleWorkspaceSelect}
          onCreateWorkspace={() => navigateToView({ type: 'workspace-new' })}
          onEditWorkspace={(slug) => navigateToView({ type: 'workspace-edit', slug })}
          onToggleSettings={() => {
            if (currentView.type === 'settings') {
              navigateToWorkspace();
            } else {
              navigateToView({ type: 'settings' });
            }
          }}
        />

        {globalError && (
          <div className="global-error">
            <span>{globalError}</span>
          </div>
        )}

        <div className="main-content main-content--full">
          {currentView.type === 'agent-new' && (
            <AgentEditorView
              apiBase={API_BASE}
              onBack={navigateToWorkspace}
              onSaved={handleAgentSaved}
            />
          )}
          {currentView.type === 'agent-edit' && (
            <AgentEditorView
              apiBase={API_BASE}
              slug={currentView.slug}
              initialTab={currentView.initialTab}
              onBack={navigateToWorkspace}
              onSaved={handleAgentSaved}
            />
          )}
          {currentView.type === 'workspace-new' && (
            <WorkspaceEditorView
              apiBase={API_BASE}
              onBack={navigateToWorkspace}
              onSaved={handleWorkspaceSaved}
            />
          )}
          {currentView.type === 'workspace-edit' && (
            <WorkspaceEditorView
              apiBase={API_BASE}
              slug={currentView.slug}
              onBack={navigateToWorkspace}
              onSaved={handleWorkspaceSaved}
            />
          )}
          {currentView.type === 'tools' && (
            <ToolManagementView
              apiBase={API_BASE}
              agentSlug={currentView.slug}
              agentName={
                agents.find((a) => a.slug === currentView.slug)?.name || currentView.slug
              }
              onBack={navigateToWorkspace}
            />
          )}
          {currentView.type === 'workflows' && (
            <WorkflowManagementView
              apiBase={API_BASE}
              agentSlug={currentView.slug}
              agentName={
                agents.find((a) => a.slug === currentView.slug)?.name || currentView.slug
              }
              onBack={navigateToWorkspace}
            />
          )}
          {currentView.type === 'settings' && (
            <SettingsView
              apiBase={API_BASE}
              onBack={navigateToWorkspace}
              onSaved={handleSettingsSaved}
              onEditAgent={(slug) => navigateToView({ type: 'agent-edit', slug })}
              onCreateAgent={() => navigateToView({ type: 'agent-new' })}
              onEditWorkspace={(slug) => navigateToView({ type: 'workspace-edit', slug })}
              onCreateWorkspace={() => navigateToView({ type: 'workspace-new' })}
              chatFontSize={chatFontSize}
              onChatFontSizeChange={setChatFontSize}
            />
          )}
        </div>

        <ChatDock
          agents={agents}
          apiBase={API_BASE}
          availableModels={availableModels}
          onRequestAuth={handleAuthError}
        />

        {toastMessage && (
          <div 
            className="toast" 
            onClick={() => {
              if (toastSessionId) {
                focusSession(toastSessionId);
                setToastMessage(null);
                setToastSessionId(null);
              }
            }}
            style={{ cursor: toastSessionId ? 'pointer' : 'default' }}
          >
            <span>{toastMessage}</span>
            <button type="button" onClick={(e) => {
              e.stopPropagation();
              setToastMessage(null);
              setToastSessionId(null);
            }}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    );
  }

  // Render workspace view
  const activeTab = selectedWorkspace?.tabs.find((t: any) => t.id === activeTabId);

  return (
    <div className="app">
      <Header
        workspaces={workspaces}
        selectedWorkspace={selectedWorkspace}
        currentView={currentView}
        onWorkspaceSelect={handleWorkspaceSelect}
        onCreateWorkspace={() => navigateToView({ type: 'workspace-new' })}
        onEditWorkspace={(slug) => navigateToView({ type: 'workspace-edit', slug })}
        onToggleSettings={() => {
          if (currentView.type === 'settings') {
            navigateToWorkspace();
          } else {
            navigateToView({ type: 'settings' });
          }
        }}
      />

      <WorkspaceHeader
        selectedWorkspace={selectedWorkspace}
        activeTabId={activeTabId}
        onTabChange={handleTabChange}
        onPromptSelect={handlePromptSelect}
      />

      {managementNotice && (
        <div className="management-notice">
          <span>{managementNotice}</span>
          <button type="button" onClick={() => setManagementNotice(null)}>
            Close
          </button>
        </div>
      )}

      {globalError && (
        <div className="global-error">
          <span>{globalError}</span>
        </div>
      )}

      <div className="main-content">
        {!selectedWorkspace ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl mb-4">📋</div>
              <div className="text-xl font-medium mb-2">Loading workspace...</div>
              <div className="text-sm text-gray-500">Please wait while we load your workspace</div>
            </div>
          </div>
        ) : (
          <>
            <div 
              className={`workspace-panel ${!isDockCollapsed ? 'has-chat-dock' : ''}`}
              style={{ paddingBottom: isDockCollapsed ? '43px' : `${dockHeight}px` }}
            >
              <WorkspaceRenderer
                componentId={activeTab?.component || 'project-stallion-dashboard'}
                workspace={selectedWorkspace}
                activeTab={activeTab}
                activeTabId={activeTabId}
                onTabChange={(tabId) => setActiveTabId(tabId)}
                onLaunchPrompt={handlePromptSelect}
                onRefresh={() => {
                  // Clear session storage for the current workspace
                  const prefix = `${selectedWorkspace?.slug || 'workspace'}-`;
                  Object.keys(sessionStorage).forEach(key => {
                    if (key.startsWith(prefix)) {
                      sessionStorage.removeItem(key);
                    }
                  });
                  // Trigger a re-render by updating a timestamp
                  window.location.reload();
                }}
                onRequestAuth={handleAuthError}
                onSendToChat={(text, agent) => {
                  if (agent) {
                    handleSendToChat(text, agent);
                  } else {
                    setAgentSelectorModal({
                      show: true,
                      onSelect: (agentSlug) => {
                        setAgentSelectorModal(null);
                        handleSendToChat(text, agentSlug);
                      }
                    });
                  }
                }}
              />
            </div>

            {/* New ChatDock component - will replace old implementation below */}
            <ChatDock
              agents={agents}
              apiBase={API_BASE}
              availableModels={availableModels}
              onRequestAuth={handleAuthError}
            />

            {/* OLD IMPLEMENTATION - TO BE REMOVED */}
            <div
              className={`chat-dock ${isDockCollapsed ? 'is-collapsed' : ''} ${isDockMaximized ? 'is-maximized' : ''} ${isDragging ? 'is-dragging' : ''}`}
              style={{ 
                height: isDockCollapsed 
                  ? '43px' 
                  : isDockMaximized 
                    ? `${window.innerHeight - 107}px` 
                    : `${dockHeight}px`,
                display: 'none' // Hide old implementation
              }}
              ref={chatSectionRef}
            >
              {!isDockCollapsed && !isDockMaximized && (
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
                  if (isDockMaximized) {
                    setDockHeight(previousDockHeight);
                    setIsDockMaximized(false);
                  }
                  setIsDockCollapsed((prev) => !prev);
                }}
                style={{
                  cursor: 'pointer',
                  ...(isDockMaximized && {
                    background: 'rgba(var(--color-primary-rgb, 59, 130, 246), 0.1)',
                    borderBottom: '2px solid var(--color-primary)'
                  })
                }}>
                <div className="chat-dock__title" style={{ flex: 1 }}>
                  <span>Chat Dock</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>⌘D</span>
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
                                    background: 'transparent',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                    borderBottom: idx < activeSessions.length - 1 ? '1px solid var(--border-primary)' : 'none',
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
                        // Restore to previous state
                        setDockHeight(previousDockHeight);
                        setIsDockCollapsed(previousDockCollapsed);
                        setIsDockMaximized(false);
                      } else {
                        // Save current state and maximize
                        setPreviousDockHeight(dockHeight);
                        setPreviousDockCollapsed(isDockCollapsed);
                        setDockHeight(window.innerHeight - 107);
                        setIsDockMaximized(true);
                        setIsDockCollapsed(false);
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
                    title={isDockMaximized ? 'Restore (⌘M)' : 'Maximize (⌘M)'}
                  >
                    {isDockMaximized ? '⬇' : '⬆'}
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>⌘M</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDockCollapsed(!isDockCollapsed);
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
                    title={isDockCollapsed ? 'Expand' : 'Collapse'}
                  >
                    <svg style={{ 
                      width: '16px', 
                      height: '16px',
                      transform: isDockCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                      transition: 'transform 0.2s',
                    }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>

              {!isDockCollapsed && (
                <>
                  <div className="chat-dock__tabs">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, position: 'relative' }}>
                      <SessionManagementMenu
                        sessions={sessions.filter(s => s.conversationId)}
                        activeSessionId={activeSessionId}
                        apiBase={API_BASE}
                        agents={agents}
                        chatDockRef={chatSectionRef}
                        onTitleUpdate={(sessionId, newTitle) => {
      // REMOVED: updateSession - data comes from ConversationsContext
                        }}
                        onDelete={(sessionId) => {
                          removeSession(sessionId);
                        }}
                        onSelect={(sessionId) => {
                          focusSession(sessionId);
                        }}
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
                        {sessions.map((session, idx) => {
                          const agent = agents.find(a => a.slug === session.agentSlug);
                          const agentIcon = agent ? getAgentIcon(agent) : null;
                          
                          return (
                          <button
                            type="button"
                            key={session.id}
                            ref={(el) => {
                              if (el && session.id === activeSessionId) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                              }
                            }}
                            className={`chat-dock__tab ${
                              session.id === activeSessionId ? 'is-active' : ''
                            } ${session.hasUnread ? 'has-unread' : ''} ${session.status === 'sending' ? 'is-processing' : ''}`}
                            onClick={() => focusSession(session.id)}
                            title={`Switch to tab (⌘${idx + 1})`}
                          >
                            {agentIcon && (
                              <div style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--color-primary)',
                                color: 'var(--bg-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: agentIcon.isCustomIcon ? '12px' : '9px',
                                fontWeight: 600,
                                flexShrink: 0,
                                marginRight: '8px'
                              }}>
                                {agentIcon.display}
                              </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="chat-dock__tab-title">
                                {session.title}
                                {session.status === 'sending' && (
                                  <span className="chat-dock__tab-badge">●</span>
                                )}
                              </div>
                              <div className="chat-dock__tab-agent">{session.agentName}</div>
                              {(() => {
                                const agent = agents.find(a => a.slug === session.agentSlug);
                                const agentModelId = typeof agent?.model === 'string' ? agent.model : agent?.model?.modelId;
                                const isCustomModel = session.model && session.model !== agentModelId;
                                if (!isCustomModel) return null;
                                const modelInfo = availableModels.find(m => m.id === session.model);
                                return (
                                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                                    {modelInfo?.name || 'Custom'}
                                  </div>
                                );
                              })()}
                            </div>
                            {idx < 9 && (
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
                                ⌘{idx + 1}
                              </span>
                            )}
                            <span
                              className="chat-dock__tab-close"
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation();
                                removeSession(session.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  removeSession(session.id);
                                }
                              }}
                              title="Close (⌘X)"
                              style={{ flexShrink: 0 }}
                            >
                              ×
                            </span>
                          </button>
                        );
                        })}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setChatFontSize(prev => Math.max(10, prev - 1));
                          }}
                          disabled={chatFontSize <= 10}
                          title="Decrease font size"
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-primary)',
                            color: 'var(--text-primary)',
                            cursor: chatFontSize <= 10 ? 'not-allowed' : 'pointer',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            lineHeight: 1,
                            opacity: chatFontSize <= 10 ? 0.3 : 1
                          }}
                        >
                          A−
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setChatFontSize(defaultFontSize);
                          }}
                          title="Reset font size"
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-primary)',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            lineHeight: 1,
                            opacity: chatFontSize === defaultFontSize ? 0.5 : 1
                          }}
                        >
                          A
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setChatFontSize(prev => Math.min(24, prev + 1));
                          }}
                          disabled={chatFontSize >= 24}
                          title="Increase font size"
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-primary)',
                            color: 'var(--text-primary)',
                            cursor: chatFontSize >= 24 ? 'not-allowed' : 'pointer',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            lineHeight: 1,
                            opacity: chatFontSize >= 24 ? 0.3 : 1
                          }}
                        >
                          A+
                        </button>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)', minWidth: '32px', textAlign: 'center' }}>
                          {Math.round((chatFontSize / defaultFontSize) * 100)}%
                        </span>
                      </div>
                      <button
                        type="button"
                        className="chat-dock__new"
                        onClick={() => {
                          setShowSessionPicker(true);
                        }}
                        title="Open Conversation (⌘O)"
                      >
                        Open <span style={{ fontSize: '10px', opacity: 0.7 }}>⌘O</span>
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
                        title="New Chat (⌘T)"
                      >
                        + New <span style={{ fontSize: '10px', opacity: 0.7 }}>⌘T</span>
                      </button>
                    </div>
                  </div>

                  <div className="chat-dock__body">
                    {activeSession ? (
                      <>
                        {showStatsPanel && (
                          <ConversationStats
                            agentSlug={activeSession.agentSlug}
                            conversationId={activeSession.conversationId || ''}
                            apiBase={API_BASE}
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
                          {activeSession.messages.length === 0 && !ephemeralMessages[activeSession.id] ? (
                            <div className="empty-state">
                              <h3>Start a conversation</h3>
                              <p>Type a message below to chat with {activeSession.agentName}</p>
                              <div style={{ marginTop: '1rem', fontSize: '0.85em', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                Type '/' to see available slash commands
                              </div>
                            </div>
                          ) : (
                            <>
                              {activeSession.messages.map((msg, idx) => {
                                const isLastAssistant = idx === activeSession.messages.length - 1 && msg.role === 'assistant';
                                const hasPendingApproval = msg.contentParts?.some(p => p.tool?.needsApproval);
                                const isStreaming = activeSession.status === 'sending' && isLastAssistant && !hasPendingApproval;
                                const textContent = msg.contentParts?.filter(p => p.type === 'text').map(p => p.content).join('\n') || msg.content || '';
                                
                                return (
                                  <div key={`${activeSession.id}-msg-${idx}`} className={`message ${msg.role}`}>
                                  <div style={{ position: 'relative' }}>
                                    {msg.role === 'assistant' && msg.model && (
                                      <div style={{ 
                                        fontSize: '0.64em', 
                                        color: 'var(--text-muted)', 
                                        marginBottom: '4px',
                                        fontStyle: 'italic',
                                        opacity: 0.6
                                      }}>
                                        {msg.model.includes('claude-3-7-sonnet') ? '🤖 Claude 3.7 Sonnet' :
                                         msg.model.includes('claude-3-5-sonnet-20241022') ? '🤖 Claude 3.5 Sonnet v2' :
                                         msg.model.includes('claude-3-5-sonnet') ? '🤖 Claude 3.5 Sonnet' :
                                         msg.model.includes('claude-3-opus') ? '🤖 Claude 3 Opus' :
                                         msg.model.includes('claude-3-haiku') ? '🤖 Claude 3 Haiku' : '🤖 Custom'}
                                      </div>
                                    )}
                                    {msg.attachments && msg.attachments.length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                                        {msg.attachments.map((att) => (
                                          <div
                                            key={att.id}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '8px',
                                              padding: '8px',
                                              background: 'var(--bg-secondary)',
                                              border: '1px solid var(--border-primary)',
                                              borderRadius: '4px',
                                              maxWidth: '200px',
                                            }}
                                          >
                                            {att.preview ? (
                                              <img
                                                src={att.preview}
                                                alt={att.name}
                                                style={{
                                                  maxWidth: '120px',
                                                  maxHeight: '120px',
                                                  objectFit: 'contain',
                                                  borderRadius: '4px',
                                                  cursor: 'pointer',
                                                }}
                                                onClick={() => window.open(att.preview, '_blank')}
                                                title="Click to view full size"
                                              />
                                            ) : (
                                              <div
                                                style={{
                                                  width: '40px',
                                                  height: '40px',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'center',
                                                  background: 'var(--bg-tertiary)',
                                                  borderRadius: '4px',
                                                  fontSize: '20px',
                                                }}
                                              >
                                                📄
                                              </div>
                                            )}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                              <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {att.name}
                                              </div>
                                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                {(att.size / 1024).toFixed(1)} KB
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {msg.contentParts && msg.contentParts.length > 0 ? (
                                      // Render mixed content inline with deduplication
                                      (() => {
                                        const seenToolIds = new Set<string>();
                                        return msg.contentParts.map((part, partIdx) => {
                                          if (part.type === 'tool') {
                                            if (seenToolIds.has(part.tool?.id)) return null;
                                            seenToolIds.add(part.tool?.id);
                                          }
                                          return part.type === 'text' ? (
                                            <ReactMarkdown key={partIdx}>{part.content || ''}</ReactMarkdown>
                                          ) : (
                                            <ToolCallDisplay 
                                              key={partIdx} 
                                              toolCall={part.tool!}
                                              onApprove={async (action) => {
                                                const approved = action !== 'deny';
                                                
                                                // Cancel stream if denied
                                                if (!approved && activeAbortController) {
                                                  activeAbortController.abort('Tool denied by user');
                                                  setActiveAbortController(null);
                                                  
                                                  // Update session status to cancelled
      // REMOVED: updateSession - data comes from ConversationsContext
                                                }
                                                
                                                // Resume loading indicator for approved tools
                                                if (approved) {
      // REMOVED: updateSession - data comes from ConversationsContext
                                                }
                                                
                                                try {
                                                  await fetch(`${API_BASE}/tool-approval/${part.tool!.id}`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ approved }),
                                                  });
                                                  
                                                  // Remove needsApproval flag
      // REMOVED: updateSession - data comes from ConversationsContext

                                                  // Add ephemeral feedback message
                                                  if (!approved) {
                                                    // Add ephemeral message for denial
      // REMOVED: updateSession - data comes from ConversationsContext
                                                  }
                                                } catch (err) {
                                                  console.error('Failed to send approval:', err);
                                                  // Add ephemeral error message
      // REMOVED: updateSession - data comes from ConversationsContext
                                                }
                                              }}
                                            />
                                          );
                                        });
                                      })()
                                    ) : (
                                      // Fallback for old messages or messages without contentParts
                                      <>
                                        {msg.content && <ReactMarkdown>{msg.content}</ReactMarkdown>}
                                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                                          <div className="tool-calls">
                                            {msg.toolCalls.map((tc, tcIdx) => (
                                              <ToolCallDisplay key={tcIdx} toolCall={tc} />
                                            ))}
                                          </div>
                                        )}
                                      </>
                                    )}
                                    {msg.showContinue && (
                                      <button
                                        onClick={() => {
                                          updateChat(activeSession.id, { input: 'continue' });
                                          sendMessage(activeSession.id, 'continue');
                                        }}
                                        style={{
                                          marginTop: '8px',
                                          padding: '6px 12px',
                                          fontSize: '13px',
                                          background: 'var(--accent-primary)',
                                          color: 'white',
                                          border: 'none',
                                          borderRadius: '6px',
                                          cursor: 'pointer',
                                          fontWeight: 500,
                                        }}
                                      >
                                        Continue
                                      </button>
                                    )}
                                    {isStreaming && (
                                      <span className="loading-dots" style={{ display: 'inline-block', marginLeft: '0.5rem' }}>
                                        <span style={{ animationDelay: '0s' }}>●</span>
                                        <span style={{ animationDelay: '0.2s' }}>●</span>
                                        <span style={{ animationDelay: '0.4s' }}>●</span>
                                      </span>
                                    )}
                                    {textContent && msg.role === 'assistant' && (
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(textContent);
                                          showToast('Copied to clipboard');
                                        }}
                                        style={{
                                          position: 'absolute',
                                          bottom: '4px',
                                          right: '4px',
                                          padding: '4px',
                                          fontSize: '18px',
                                          background: 'none',
                                          border: 'none',
                                          cursor: 'pointer',
                                          color: 'var(--text-secondary)',
                                          lineHeight: 1,
                                          opacity: 1,
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.5'}
                                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                                        title="Copy message"
                                      >
                                        ⎘
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {ephemeralMessages[activeSession.id]?.map((msg, idx) => {
                              const manageCommandsMatch = msg.content.match(/\[MANAGE_COMMANDS:([^\]]+)\]/);
                              const contentWithoutButton = msg.content.replace(/\[MANAGE_COMMANDS:[^\]]+\]/, '').trim();
                              
                              return (
                                <div key={`ephemeral-${idx}`} className={`message ${msg.role}`}>
                                  <div style={{ position: 'relative' }}>
                                    <ReactMarkdown 
                                      remarkPlugins={[remarkGfm]}
                                      components={{
                                        a: ({ node, href, children, ...props }) => {
                                          if (href?.startsWith('#/agents/') && href.includes('/edit')) {
                                            const slug = href.replace('#/agents/', '').replace('/edit', '');
                                            return (
                                              <a
                                                href={href}
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  navigateToView({ type: 'agent-edit', slug });
                                                }}
                                                {...props}
                                              >
                                                {children}
                                              </a>
                                            );
                                          }
                                          return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
                                        }
                                      }}
                                    >
                                      {contentWithoutButton}
                                    </ReactMarkdown>
                                    {manageCommandsMatch && (
                                      <button
                                        className="button button--secondary"
                                        onClick={() => {
                                          const slug = manageCommandsMatch[1].replace(/^["']|["']$/g, '');
                                          navigateToView({ type: 'agent-edit', slug, initialTab: 'commands' });
                                        }}
                                        style={{ marginTop: '12px', padding: '8px 12px' }}
                                      >
                                        Manage Slash Commands
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {activeSession.status === 'sending' && (() => {
                              const lastMsg = activeSession.messages[activeSession.messages.length - 1];
                              const showLoading = !lastMsg || lastMsg.role !== 'assistant';
                              
                              return showLoading ? (
                                <div className="message assistant">
                                  <div style={{ position: 'relative' }}>
                                    <span className="loading-dots" style={{ display: 'inline-block' }}>
                                      <span style={{ animationDelay: '0s' }}>●</span>
                                      <span style={{ animationDelay: '0.2s' }}>●</span>
                                      <span style={{ animationDelay: '0.4s' }}>●</span>
                                    </span>
                                  </div>
                                </div>
                              ) : null;
                            })()}
                            </>
                          )}
                          <div ref={messagesEndRef} />
                        </div>
                        
                        {isUserScrolledUp && (
                          <button
                            onClick={() => {
                              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                              setIsUserScrolledUp(false);
                            }}
                            style={{
                              position: 'absolute',
                              bottom: activeSession.status === 'sending' ? '120px' : '80px',
                              right: '20px',
                              padding: '8px 16px',
                              background: 'var(--color-primary)',
                              color: 'var(--color-bg)',
                              border: 'none',
                              borderRadius: '20px',
                              cursor: 'pointer',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                              fontSize: '0.9rem',
                              zIndex: 10
                            }}
                          >
                            ↓ Scroll to bottom
                          </button>
                        )}
                        
                        
                        <div className="chat-input-container">
                          {activeSession.error && <div className="error">{activeSession.error}</div>}
                          {activeSession.queuedMessages && activeSession.queuedMessages.length > 0 && (
                            <div className="queued-messages">
                              <div className="queued-messages__label">Queued ({activeSession.queuedMessages.length}):</div>
                              <div className="queued-messages__list">
                                {activeSession.queuedMessages.map((msg, idx) => (
                                  <div key={idx} className="queued-message">{msg}</div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="chat-input" style={{ position: 'relative' }}>
                            {showModelSelector && (
                              <div className="command-autocomplete">
                                {(() => {
                                  const agent = agents.find(a => a.slug === activeSession?.agentSlug) || currentAgent;
                                  const agentModelId = typeof agent?.model === 'string' ? agent.model : agent?.model?.modelId;
                                  const currentModel = activeSession?.model || agentModelId;
                                  const normalizeId = (id: string) => id?.replace(/^us\./, '') || '';
                                  
                                  const filtered = availableModels.filter((model) => {
                                    if (!activeSession?.input) return true;
                                    const query = activeSession.input.replace('/model ', '').toLowerCase();
                                    return model.name.toLowerCase().includes(query) || 
                                           model.id.toLowerCase().includes(query);
                                  });
                                  
                                  // Sort: active model first, then alphabetically
                                  const sorted = [...filtered].sort((a, b) => {
                                    const aIsCurrent = normalizeId(currentModel) === normalizeId(a.id) || currentModel === a.id;
                                    const bIsCurrent = normalizeId(currentModel) === normalizeId(b.id) || currentModel === b.id;
                                    if (aIsCurrent && !bIsCurrent) return -1;
                                    if (!aIsCurrent && bIsCurrent) return 1;
                                    return 0;
                                  });
                                  
                                  return sorted.slice(0, 10).map((model, idx) => {
                                  const isCurrent = normalizeId(currentModel) === normalizeId(model.id) || currentModel === model.id;
                                  
                                  return (
                                    <div
                                      key={model.id}
                                      className={`command-item ${idx === selectedModelIndex ? 'selected' : ''}`}
                                      onClick={() => {
                                        if (activeSessionId) {
                                          const agent = agents.find(a => a.slug === activeSession?.agentSlug) || currentAgent;
                                          const agentModelId = typeof agent?.model === 'string' ? agent.model : agent?.model?.modelId;
                                          const currentModel = activeSession?.model || agentModelId;
                                          const normalizeId = (id: string) => id?.replace(/^us\./, '') || '';
                                          const isAlreadyActive = normalizeId(currentModel) === normalizeId(model.id) || currentModel === model.id;
                                          
                                          updateChat(activeSessionId, { input: '', inputHistory: [...current.inputHistory, `/model ${model.name}`] });
                                          setShowModelSelector(false);
                                        }
                                      }}
                                    >
                                      <span className="command-item__name">{model.name}{isCurrent ? ' (active)' : ''}</span>
                                      <span className="command-item__description" style={{ fontSize: '10px', opacity: 0.6 }}>{model.id}</span>
                                    </div>
                                  );
                                })})()}
                              </div>
                            )}
                            {showCommandAutocomplete && (
                              <div className="command-autocomplete">
                                {getFilteredCommands().map((cmd, idx) => (
                                  <div
                                    key={cmd.cmd}
                                    ref={(el) => {
                                      if (idx === selectedCommandIndex && el) {
                                        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                                      }
                                    }}
                                    className={`command-item ${idx === selectedCommandIndex ? 'selected' : ''}`}
                                    onClick={() => {
                                      if (activeSessionId) {
                                        setShowCommandAutocomplete(false);
                                        
                                        // If selecting /model, insert it with space to trigger model selector
                                        if (cmd.cmd === '/model') {
                                          updateChat(activeSessionId, { input: '/model ' });
                                          setShowModelSelector(true);
                                          setSelectedModelIndex(0);
                                        } else {
                                          sendMessage(activeSessionId, cmd.cmd);
                                        }
                                      }
                                    }}
                                  >
                                    <span className="command-name">
                                      {cmd.cmd}
                                      {cmd.aliases && cmd.aliases.length > 0 && (
                                        <span style={{ opacity: 0.6, fontWeight: 400 }}> / {cmd.aliases.join(' / ')}</span>
                                      )}
                                      {cmd.isCustom && (
                                        <span style={{ marginLeft: '8px', fontSize: '10px', color: 'var(--color-primary)', fontWeight: 600 }}>(custom)</span>
                                      )}
                                    </span>
                                    <span className="command-desc">{cmd.description}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ position: 'relative', flex: 1 }}>
                              <textarea
                                ref={textareaRef}
                                value={activeSession.input}
                                onChange={(event) =>
                                  setSessionInput(activeSession.id, event.target.value)
                                }
                                onKeyDown={handleKeyDown}
                                placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                                style={{ width: '100%', paddingRight: activeSession.input ? '30px' : undefined }}
                              />
                              {activeSession.input && (
                                <button
                                  onClick={() => {
                                    updateChat(activeSession.id, { input: '' });
                                    setShowModelSelector(false);
                                    setShowCommandAutocomplete(false);
                                  }}
                                  style={{
                                    position: 'absolute',
                                    right: '8px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '16px',
                                    color: 'var(--text-muted)',
                                    padding: '4px',
                                    lineHeight: 1,
                                    opacity: 0.6,
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                                  title="Clear input (Ctrl+C)"
                                >
                                  ×
                                </button>
                              )}
                              <ContextPercentage
                                agentSlug={activeSession.agentSlug}
                                conversationId={activeSession.conversationId}
                                apiBase={API_BASE}
                                messageCount={activeSession.messages.length}
                                onClick={() => setShowStatsPanel(!showStatsPanel)}
                              />
                            </div>
                            <FileAttachmentInput
                              attachments={activeSession.attachments || []}
                              onAdd={(newAttachments) => {
                                const current = activeSession.attachments || [];
                                updateChat(activeSession.id, { attachments: [...current, ...newAttachments] });
                              }}
                              onRemove={(id) => {
                                const current = activeSession.attachments || [];
                                updateChat(activeSession.id, { attachments: current.filter(a => a.id !== id) });
                              }}
                              disabled={activeSession.status === 'sending'}
                              supportsImages={true}
                              supportsFiles={true}
                            />
                            <button
                              onClick={() => {
                                setShowCommandAutocomplete(false);
                                sendMessage(activeSession.id);
                              }}
                              disabled={!activeSession.input.trim() && (!activeSession.attachments || activeSession.attachments.length === 0)}
                            >
                              {activeSession.status === 'sending' ? 'Queue' : 'Send'}
                            </button>
                            {activeSession.status === 'sending' && activeAbortController && (
                              <button
                                onClick={() => {
                                  activeAbortController.abort();
                                  setActiveAbortController(null);
                                }}
                                style={{
                                  background: 'var(--bg-secondary)',
                                  color: 'var(--text-muted)',
                                  border: '1px solid var(--border-primary)',
                                }}
                                title="Cancel (Ctrl+C or Esc)"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="chat-dock__empty">
                        <p>No active sessions.</p>
                        <p style={{ fontSize: '0.9em', color: 'var(--text-muted)', marginTop: '8px' }}>
                          Press <kbd style={{ 
                            padding: '2px 6px', 
                            background: 'var(--bg-tertiary)', 
                            border: '1px solid var(--border-primary)', 
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '0.95em'
                          }}>⌘T</kbd> to start a new chat
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {toastMessage && (
        <div 
          className="toast" 
          onClick={() => {
            if (toastSessionId) {
              focusSession(toastSessionId);
              setToastMessage(null);
              setToastSessionId(null);
            }
          }}
          style={{ cursor: toastSessionId ? 'pointer' : 'default' }}
        >
          <span>{toastMessage}</span>
          <button type="button" onClick={(e) => {
            e.stopPropagation();
            setToastMessage(null);
            setToastSessionId(null);
          }}>
            Dismiss
          </button>
        </div>
      )}

      {showPinDialog && (
        <PinDialog
          onSubmit={handlePinSubmit}
          onCancel={handlePinCancel}
          isLoading={isAuthenticating}
          error={authError}
        />
      )}

      {agentSelectorModal?.show && (
        <AgentSelectorModal
          agents={agents}
          onSelect={agentSelectorModal.onSelect}
          onCancel={() => setAgentSelectorModal(null)}
        />
      )}

      {/* New Chat Modal */}
      {showNewChatModal && (() => {
        const filteredAgents = agents.filter(a => 
          a.name.toLowerCase().includes(newChatSearch.toLowerCase()) ||
          a.slug.toLowerCase().includes(newChatSearch.toLowerCase())
        );
        
        return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setShowNewChatModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '500px',
              maxHeight: '600px',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-primary)' }}>
              <h3 style={{ margin: '0 0 12px 0' }}>New Chat</h3>
              <input
                type="text"
                placeholder="Search agents..."
                value={newChatSearch}
                onChange={(e) => {
                  setNewChatSearch(e.target.value);
                  setNewChatSelectedIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setNewChatSelectedIndex((prev) => Math.min(prev + 1, filteredAgents.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setNewChatSelectedIndex((prev) => Math.max(prev - 1, 0));
                  } else if (e.key === 'Enter' && filteredAgents[newChatSelectedIndex]) {
                    openChatForAgent(filteredAgents[newChatSelectedIndex]);
                    setShowNewChatModal(false);
                  } else if (e.key === 'Escape') {
                    setShowNewChatModal(false);
                  }
                }}
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '8px',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                }}
              />
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '400px' }}>
              {filteredAgents.map((agent, idx) => (
                  <button
                    key={agent.slug}
                    onClick={() => {
                      openChatForAgent(agent);
                      setShowNewChatModal(false);
                    }}
                    onMouseEnter={() => setNewChatSelectedIndex(idx)}
                    style={{
                      width: '100%',
                      padding: '12px 20px',
                      border: 'none',
                      borderBottom: '1px solid var(--border-primary)',
                      background: idx === newChatSelectedIndex ? 'var(--accent-primary)' : 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: idx === newChatSelectedIndex ? 'white' : 'var(--text-primary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>{agent.name}</div>
                    {agent.description && (
                      <div style={{ fontSize: '12px', color: idx === newChatSelectedIndex ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)' }}>
                        {agent.description}
                      </div>
                    )}
                  </button>
                ))}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Session Picker Modal */}
      <SessionPickerModal
        isOpen={showSessionPicker}
        onClose={() => setShowSessionPicker(false)}
        onSelect={openConversation}
        apiBase={API_BASE}
        agents={agents}
      />
    </div>
  );
}

function AppWithSDK() {
  return (
    <ApiBaseProvider>
      <AppWithSDKInner />
    </ApiBaseProvider>
  );
}

function AppWithSDKInner() {
  const { apiBase } = useApiBase();
  
  return (
    <SDKAdapter apiBase={apiBase}>
      <PermissionManager>
        <EventRouter>
          <App />
        </EventRouter>
      </PermissionManager>
    </SDKAdapter>
  );
}

export default AppWithSDK;
