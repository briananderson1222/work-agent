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
import { AgentSelectorModal } from './components/AgentSelectorModal';
import { PinDialog } from './components/PinDialog';
import { ConversationStats, ContextPercentage } from './components/ConversationStats';
import { useAppData } from './contexts/AppDataContext';
import { WorkspaceRenderer } from './workspaces';
import { AgentEditorView } from './views/AgentEditorView';
import { WorkspaceEditorView } from './views/WorkspaceEditorView';
import { ToolManagementView } from './views/ToolManagementView';
import { WorkflowManagementView } from './views/WorkflowManagementView';
import { SettingsView } from './views/SettingsView';
import { useAwsAuth } from './hooks/useAwsAuth';
import { setAuthCallback, apiRequest } from './lib/apiClient';
import { getAgentIcon } from './utils/workspace';
import type {
  AgentSummary,
  AgentQuickPrompt,
  ChatMessage,
  ChatSession,
  WorkflowMetadata,
  NavigationView,
} from './types';

const API_BASE = 'http://localhost:3141';

function ToolCallDisplay({ toolCall }: { toolCall: { id: string; name: string; args: any; result?: any; state?: string; error?: string } }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Create abbreviated args preview
  const argsPreview = toolCall.args 
    ? Object.keys(toolCall.args).length > 0
      ? `${Object.keys(toolCall.args).slice(0, 2).map(k => `${k}: ${JSON.stringify(toolCall.args[k]).slice(0, 20)}`).join(', ')}${Object.keys(toolCall.args).length > 2 ? '...' : ''}`
      : 'no args'
    : 'no args';

  return (
    <div className="tool-call" style={{ 
      display: 'inline-block', 
      margin: '0.25rem',
      padding: '0.5rem',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: '4px',
      verticalAlign: 'top'
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
          textAlign: 'left'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
          <span className="tool-call__toggle">{isExpanded ? '▼' : '▶'}</span>
          <span className="tool-call__name" style={{ fontWeight: 500 }}>{toolCall.name}</span>
          {toolCall.error && <span className="tool-call__error">⚠️</span>}
        </div>
        <div style={{ fontSize: '0.85em', opacity: 0.7, paddingLeft: '1rem' }}>{argsPreview}</div>
      </button>
      {isExpanded && (
        <div className="tool-call__details" style={{ marginTop: '0.5rem', fontSize: '0.9em' }}>
          <div className="tool-call__section">
            <strong>Tool ID:</strong>
            <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '2px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{toolCall.id}</pre>
          </div>
          <div className="tool-call__section">
            <strong>Arguments:</strong>
            <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '2px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(toolCall.args, null, 2)}</pre>
          </div>
          {toolCall.result && (
            <div className="tool-call__section">
              <strong>Result:</strong>
              <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '2px', overflowX: 'auto', maxHeight: '200px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(toolCall.result, null, 2)}</pre>
            </div>
          )}
          {toolCall.error && (
            <div className="tool-call__section tool-call__section--error">
              <strong>Error:</strong>
              <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '2px', overflowX: 'auto', color: 'red', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{toolCall.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function App() {
  const { models: availableModels } = useAppData();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/agent\/([^/]+)/);
    return match ? match[1] : null;
  });
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<any | null>(null);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [agentSelectorModal, setAgentSelectorModal] = useState<{
    show: boolean;
    onSelect: (slug: string) => void;
  } | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('session');
  });
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
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [managementNotice, setManagementNotice] = useState<string | null>(null);
  const [workflowCatalog, setWorkflowCatalog] = useState<Record<string, WorkflowMetadata[]>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastSessionId, setToastSessionId] = useState<string | null>(null);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinDialogResolver, setPinDialogResolver] = useState<((success: boolean) => void) | null>(null);
  const [activeAbortController, setActiveAbortController] = useState<AbortController | null>(null);
  const { authenticate, isAuthenticating, error: authError } = useAwsAuth();
  const [currentView, setCurrentView] = useState<NavigationView>(() => {
    const hash = window.location.hash.slice(1); // Remove #
    
    if (hash === '/settings') return { type: 'settings' };
    if (hash === '/agents/new') return { type: 'agent-new' };
    if (hash.startsWith('/agents/') && hash.endsWith('/edit')) {
      const slug = hash.split('/')[2];
      return { type: 'agent-edit', slug };
    }
    if (hash.startsWith('/agents/') && hash.endsWith('/tools')) {
      const slug = hash.split('/')[2];
      return { type: 'tools', slug };
    }
    if (hash.startsWith('/agents/') && hash.endsWith('/workflows')) {
      const slug = hash.split('/')[2];
      return { type: 'workflows', slug };
    }
    if (hash === '/workspaces/new') return { type: 'workspace-new' };
    if (hash.startsWith('/workspaces/') && hash.endsWith('/edit')) {
      const slug = hash.split('/')[2];
      return { type: 'workspace-edit', slug };
    }
    
    return { type: 'workspace' };
  });
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Listen for hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      
      if (hash === '/settings') {
        setCurrentView({ type: 'settings' });
      } else if (hash === '/agents/new') {
        setCurrentView({ type: 'agent-new' });
      } else if (hash.startsWith('/agents/') && hash.endsWith('/edit')) {
        const slug = hash.split('/')[2];
        setCurrentView({ type: 'agent-edit', slug });
      } else if (hash.startsWith('/agents/') && hash.endsWith('/tools')) {
        const slug = hash.split('/')[2];
        setCurrentView({ type: 'tools', slug });
      } else if (hash.startsWith('/agents/') && hash.endsWith('/workflows')) {
        const slug = hash.split('/')[2];
        setCurrentView({ type: 'workflows', slug });
      } else if (hash === '/workspaces/new') {
        setCurrentView({ type: 'workspace-new' });
      } else if (hash.startsWith('/workspaces/') && hash.endsWith('/edit')) {
        const slug = hash.split('/')[2];
        setCurrentView({ type: 'workspace-edit', slug });
      } else if (!hash || hash === '/') {
        setCurrentView({ type: 'workspace' });
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  const [pendingPromptSend, setPendingPromptSend] = useState<{ sessionId: string; prompt: string } | null>(null);
  const [loadedAgents, setLoadedAgents] = useState<Set<string>>(new Set());
  const [messageQueue, setMessageQueue] = useState<Map<string, string[]>>(new Map());
  const [ephemeralMessages, setEphemeralMessages] = useState<Record<string, ChatMessage[]>>({});
  const [showNewChatModal, setShowNewChatModal] = useState(false);
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
    setAuthCallback(async () => {
      return new Promise((resolve) => {
        setPinDialogResolver(() => resolve);
        setShowPinDialog(true);
      });
    });
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
    
    let hash = '';
    
    if (currentView.type === 'settings') {
      hash = '/settings';
    } else if (currentView.type === 'agent-new') {
      hash = '/agents/new';
    } else if (currentView.type === 'agent-edit') {
      hash = `/agents/${currentView.slug}/edit`;
    } else if (currentView.type === 'workspace-new') {
      hash = '/workspaces/new';
    } else if (currentView.type === 'workspace-edit') {
      hash = `/workspaces/${currentView.slug}/edit`;
    } else if (currentView.type === 'tools') {
      hash = `/agents/${currentView.slug}/tools`;
    } else if (currentView.type === 'workflows') {
      hash = `/agents/${currentView.slug}/workflows`;
    }
    
    const query = params.toString();
    const path = currentView.type === 'workspace' && selectedAgent ? `/agent/${selectedAgent}` : '/';
    const url = query ? `${path}?${query}${hash ? '#' + hash : ''}` : `${path}${hash ? '#' + hash : ''}`;
    
    window.history.replaceState({}, '', url);
  }, [selectedAgent, activeSessionId, isDockCollapsed, isDockMaximized, currentView]);

  // Keep ref in sync with state
  useEffect(() => {
    isDockCollapsedRef.current = isDockCollapsed;
  }, [isDockCollapsed]);

  useEffect(() => {
    if (selectedAgent && agents.length > 0 && !loadedAgents.has(selectedAgent)) {
      loadSessionsForAgent(selectedAgent);
    }
  }, [selectedAgent, agents, loadedAgents]);

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
    fetchAgents();
    fetchWorkspaces();
  }, []);

  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[sessions.length - 1].id);
    }
  }, [sessions, activeSessionId]);

  useEffect(() => {
    const loadMessagesForActiveSession = async () => {
      if (!activeSessionId) return;
      const session = sessions.find(s => s.id === activeSessionId);
      if (!session || session.messages.length > 0) return;
      
      try {
        const response = await fetch(`${API_BASE}/agents/${session.agentSlug}/conversations/${session.conversationId}/messages`);
        if (response.ok) {
          const payload = await response.json();
          const messages = payload.data || [];
          
          // Only update if messages are still empty (avoid race condition)
          setSessions(prev => prev.map(s => 
            s.id === activeSessionId && s.messages.length === 0
              ? {
                  ...s,
                  messages: messages.map((msg: any) => {
                    // VoltAgent stores messages with parts array
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
                  }),
                }
              : s
          ));
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    };
    
    loadMessagesForActiveSession();
  }, [activeSessionId]);

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

    if (!workflowCatalog[currentAgent.slug]) {
      fetchWorkflowsForAgent(currentAgent.slug);
    }

    if (currentAgent.workflowWarnings && currentAgent.workflowWarnings.length > 0) {
      const warningText = `Missing workflow shortcuts for ${currentAgent.name}: ${currentAgent.workflowWarnings.join(
        ', '
      )}`;
      setManagementNotice((prev) => prev ?? warningText);
    }
  }, [currentAgent, workflowCatalog]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isDockCollapsed && activeSessionId) {
      updateSession(activeSessionId, (current) => ({
        ...current,
        hasUnread: false,
      }));
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [isDockCollapsed, activeSessionId]);

  useEffect(() => {
    if (!isDragging) return;

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
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isDockMaximized]);

  const fetchAgents = async () => {
    try {
      const payload = await apiRequest<{ data: any[] }>(`${API_BASE}/api/agents`);
      console.log('Raw agent data from API:', payload.data);
      const agentList: AgentSummary[] = (payload.data || []).map((agent: any) => ({
        slug: agent.slug ?? agent.id,
        name: agent.name,
        model: agent.model,
        updatedAt: agent.updatedAt,
        description: agent.description,
        icon: agent.icon,
        commands: agent.commands,
        ui: agent.ui,
        workflowWarnings: agent.workflowWarnings || undefined,
      }));
      console.log('Mapped agent list:', agentList);

      setAgents(agentList);
      setGlobalError(null);

      if (agentList.length > 0 && !selectedAgent) {
        setSelectedAgent(agentList[0].slug);
      }
    } catch (err: any) {
      setGlobalError(err.message);
    }
  };

  const fetchWorkspaces = async () => {
    try {
      const response = await fetch(`${API_BASE}/workspaces`);
      const data = await response.json();
      console.log('Workspaces fetched:', data);
      if (data.success) {
        setWorkspaces(data.data);
        console.log('Workspaces set:', data.data);
        if (data.data.length > 0 && !selectedWorkspace) {
          await handleWorkspaceSelect(data.data[0].slug);
        }
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    }
  };

  const handleWorkspaceSelect = async (slug: string) => {
    try {
      const response = await fetch(`${API_BASE}/workspaces/${slug}`);
      const data = await response.json();
      if (data.success) {
        setSelectedWorkspace(data.data);
        setActiveTabId(data.data.tabs[0]?.id || '');
      }
    } catch (error) {
      console.error('Failed to load workspace:', error);
    }
  };

  const loadSessionsForAgent = async (agentSlug: string) => {
    try {
      const response = await fetch(`${API_BASE}/agents/${agentSlug}/conversations`);
      if (!response.ok) return; // Silently fail if endpoint doesn't exist yet
      
      const payload = await response.json();
      const conversations = payload.data || [];
      
      // Convert backend conversations to UI sessions
      const loadedSessions: ChatSession[] = conversations.map((conv: any) => ({
        id: conv.conversationId,
        conversationId: conv.conversationId,
        agentSlug: agentSlug,
        agentName: agents.find(a => a.slug === agentSlug)?.name || agentSlug,
        title: conv.title || `${agentSlug} Chat`,
        source: 'manual' as const,
        messages: [], // Load messages on demand
        input: '',
        queuedMessages: [],
        status: 'idle' as const,
        error: null,
        createdAt: new Date(conv.createdAt).getTime(),
        updatedAt: new Date(conv.updatedAt).getTime(),
        hasUnread: false,
      }));
      
      // Merge with existing sessions from other agents
      setSessions((prev) => {
        const otherAgentSessions = prev.filter(s => s.agentSlug !== agentSlug);
        return [...otherAgentSessions, ...loadedSessions];
      });
      
      // Mark this agent as loaded
      setLoadedAgents((prev) => new Set(prev).add(agentSlug));
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const fetchWorkflowsForAgent = async (slug: string) => {
    try {
      const response = await fetch(`${API_BASE}/workflows`);
      if (!response.ok) throw new Error('Failed to fetch workflows');

      const payload = await response.json();
      const workflows: WorkflowMetadata[] = payload.data || [];
      setWorkflowCatalog((prev) => ({ ...prev, [slug]: workflows }));
    } catch (err: any) {
      setManagementNotice((prev) => prev ?? `Failed to load workflows for ${slug}: ${err.message}`);
    }
  };

  const updateSession = (sessionId: string, modifier: (session: ChatSession) => ChatSession) => {
    setSessions((prev) =>
      prev.map((session) => (session.id === sessionId ? modifier(session) : session))
    );
  };

  const removeSession = (sessionId: string) => {
    // Cancel any ongoing request for this session
    if (activeAbortController) {
      console.log('Cancelling ongoing request for session:', sessionId);
      activeAbortController.abort();
      setActiveAbortController(null);
    }
    
    setSessions((prev) => {
      const remaining = prev.filter((session) => session.id !== sessionId);
      if (activeSessionId === sessionId) {
        const next = remaining[remaining.length - 1]?.id ?? null;
        setActiveSessionId(next);
      }
      return remaining;
    });
  };

  const focusSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setIsDockCollapsed(false);
    setHistoryIndex(-1);
    setShowModelSelector(false);
    setShowCommandAutocomplete(false);
    updateSession(sessionId, (current) => ({
      ...current,
      hasUnread: false,
    }));
    setTimeout(() => {
      chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 0);
  };

  const createChatSession = (
    agent: AgentSummary,
    options: { title?: string; source: ChatSession['source']; sourceId?: string }
  ) => {
    const sessionId = `${agent.slug}:${generateId()}`;
    const conversationId = `tauri-${agent.slug}-${generateId()}`;
    const session: ChatSession = {
      id: sessionId,
      conversationId,
      agentSlug: agent.slug,
      agentName: agent.name,
      title: options.title || `${agent.name} Chat`,
      source: options.source,
      sourceId: options.sourceId,
      messages: [],
      input: '',
      queuedMessages: [],
      status: 'idle',
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hasUnread: false,
      inputHistory: [],
    };

    setSessions((prev) => [...prev, session]);
    return session;
  };

  const ensureManualSession = (agent: AgentSummary) => {
    const existing = sessions.find(
      (s) => s.agentSlug === agent.slug && s.source === 'manual'
    );
    if (existing) {
      focusSession(existing.id);
      return existing;
    }
    const session = createChatSession(agent, { source: 'manual', title: `${agent.name} Chat` });
    focusSession(session.id);
    return session;
  };

  const setSessionInput = (sessionId: string, value: string) => {
    updateSession(sessionId, (current) => ({
      ...current,
      input: value,
    }));
    
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
      updateSession(sessionId, (current) => ({ ...current, input: expandedPrompt }));
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
        // Use standard VoltAgent endpoint
        const response = await fetch(`${API_BASE}/agents/${session.agentSlug}`);
        const data = await response.json();
        const agent = data.data;
        
        const tools = agent?.tools || [];
        const autoApproveList = agent?.autoApprove || agent?.autoApproved || [];
        
        if (tools.length > 0) {
          // Sort alphabetically
          const sortedTools = [...tools].sort((a: any, b: any) => {
            const nameA = typeof a === 'string' ? a : (a.name || a.id || '');
            const nameB = typeof b === 'string' ? b : (b.name || b.id || '');
            return nameA.localeCompare(nameB);
          });
          
          const toolLines = sortedTools.map((t: any) => {
            const name = typeof t === 'string' ? t : (t.name || t.id || 'unknown');
            const isAutoApproved = autoApproveList.includes(name) || autoApproveList.some((pattern: string) => {
              if (pattern.includes('*')) {
                const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                return regex.test(name);
              }
              return pattern === name;
            });
            const trusted = isAutoApproved ? '✓' : '';
            
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
          
          const autoApproveNote = autoApproveList.length > 0 
            ? `*Auto-approve: ${autoApproveList.join(', ')}*\n\n` 
            : '';
          
          responseContent = `**Tools (${tools.length}):**\n\n${autoApproveNote}| Tool | Description | Parameters (* optional) | Trusted |\n|------|-------------|-------------------------|:-------:|\n${toolLines.join('\n')}`;
        } else {
          responseContent = `No tools configured.`;
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
      
      updateSession(sessionId, (current) => ({
        ...current,
        input: '',
      }));
      
      setShowModelSelector(true);
      setSelectedModelIndex(currentModelIndex >= 0 ? currentModelIndex : 0);
      return;
    } else if (cmd === 'clear' || cmd === 'new') {
      // Clear conversation by generating new conversationId
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        const newConversationId = `tauri-${session.agentSlug}-${generateId()}`;
        updateSession(sessionId, (current) => ({
          ...current,
          conversationId: newConversationId,
          messages: [],
          input: '',
        }));
        setEphemeralMessages(prev => ({
          ...prev,
          [sessionId]: [{ role: 'system', content: 'Conversation cleared. Starting fresh with new history.' }]
        }));
      }
      return;
    } else if (cmd === 'stats') {
      setShowStatsPanel(true);
      updateSession(sessionId, (current) => ({
        ...current,
        input: '',
      }));
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
      updateSession(sessionId, (current) => ({
        ...current,
        input: '',
      }));
    } else {
      responseContent = `Unknown command: ${command}\n\nAvailable:\n• /mcp - List MCP servers\n• /tools - Show tools\n• /model - Change model\n• /prompts - List custom commands\n• /clear or /new - Clear conversation\n• /stats - Show conversation statistics`;
    }

    // Set ephemeral message (shows in UI but not in history)
    setEphemeralMessages(prev => ({
      ...prev,
      [sessionId]: [{ role: 'assistant', content: responseContent }]
    }));
    
    // Clear input
    updateSession(sessionId, (current) => ({
      ...current,
      input: '',
    }));
  };

  const sendMessage = async (sessionId: string, overrideContent?: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;

    const text = (overrideContent ?? session.input).trim();
    if (!text) return;

    // Handle slash commands
    if (text.startsWith('/')) {
      await handleSlashCommand(sessionId, text);
      return;
    }

    // If already sending, queue the message
    if (session.status === 'sending') {
      updateSession(sessionId, (current) => ({
        ...current,
        queuedMessages: [...(current.queuedMessages || []), text],
        inputHistory: [...current.inputHistory, text],
        input: overrideContent ? current.input : '',
      }));
      return;
    }

    // Add to input history only when actually sending (not when queued)
    updateSession(sessionId, (current) => ({
      ...current,
      inputHistory: [...current.inputHistory, text],
    }));

    const userMessage: ChatMessage = { role: 'user', content: text };

    // Clear ephemeral messages when sending real message
    setEphemeralMessages(prev => {
      const { [sessionId]: _, ...rest } = prev;
      return rest;
    });

    // Reset scroll state before updating messages
    setIsUserScrolledUp(false);

    updateSession(sessionId, (current) => ({
      ...current,
      messages: [...current.messages, userMessage],
      input: '',
      status: 'sending',
      error: null,
      updatedAt: Date.now(),
      hasUnread: false,
    }));
    focusSession(sessionId);

    const abortController = new AbortController();
    setActiveAbortController(abortController);

    try {
      // Get agent to check if model override is needed
      const agent = agents.find(a => a.slug === session.agentSlug);
      const agentModelId = typeof agent?.model === 'string' ? agent.model : agent?.model?.modelId;
      const needsModelOverride = session.model && session.model !== agentModelId;

      // Use streaming /chat endpoint to see tool calls
      const response = await fetch(`${API_BASE}/agents/${session.agentSlug}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          input: text,
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
      const contentParts: Array<{ type: 'text' | 'tool'; content?: string; tool?: any }> = [];
      let currentTextChunk = '';

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
                
                updateSession(sessionId, (current) => ({
                  ...current,
                  status: 'error',
                  error: errorMsg,
                  updatedAt: Date.now(),
                }));
                
                setActiveAbortController(null);
                return;
              }
              
              if (data.type === 'text-delta' && data.delta) {
                currentTextChunk += data.delta;
                // Update current text chunk
                updateSession(sessionId, (current) => {
                  const messages = [...current.messages];
                  const lastMsg = messages[messages.length - 1];
                  if (lastMsg?.role === 'assistant') {
                    const parts = [...(lastMsg.contentParts || [])];
                    if (parts.length > 0 && parts[parts.length - 1].type === 'text') {
                      parts[parts.length - 1].content = currentTextChunk;
                    } else {
                      parts.push({ type: 'text', content: currentTextChunk });
                    }
                    lastMsg.contentParts = parts;
                  } else {
                    messages.push({ 
                      role: 'assistant', 
                      content: currentTextChunk,
                      model: current.model,
                      contentParts: [{ type: 'text', content: currentTextChunk }]
                    });
                  }
                  return { ...current, messages, updatedAt: Date.now() };
                });
              } else if (data.type === 'max-steps-reached' || data.type === 'finish' && data.reason === 'max-steps') {
                // Append max turns warning
                updateSession(sessionId, (current) => {
                  const messages = [...current.messages];
                  const lastMsg = messages[messages.length - 1];
                  if (lastMsg?.role === 'assistant') {
                    const parts = [...(lastMsg.contentParts || [])];
                    const warningText = '\n\n⚠️ *Maximum turns reached. The conversation was terminated to prevent excessive tool usage.*';
                    if (parts.length > 0 && parts[parts.length - 1].type === 'text') {
                      parts[parts.length - 1].content += warningText;
                    } else {
                      parts.push({ type: 'text', content: warningText });
                    }
                    lastMsg.contentParts = parts;
                  }
                  return { ...current, messages, updatedAt: Date.now() };
                });
              } else if (data.type === 'tool-input-available') {
                // Finalize current text chunk
                if (currentTextChunk) {
                  contentParts.push({ type: 'text', content: currentTextChunk });
                  currentTextChunk = '';
                }
                
                const toolCall = {
                  id: data.toolCallId,
                  name: data.toolName,
                  args: data.input,
                };
                
                // Add tool call inline
                updateSession(sessionId, (current) => {
                  const messages = [...current.messages];
                  const lastMsg = messages[messages.length - 1];
                  if (lastMsg?.role === 'assistant') {
                    const parts = [...(lastMsg.contentParts || [])];
                    parts.push({ type: 'tool', tool: toolCall });
                    lastMsg.contentParts = parts;
                  } else {
                    messages.push({ 
                      role: 'assistant', 
                      content: '',
                      model: current.model,
                      contentParts: [{ type: 'tool', tool: toolCall }]
                    });
                  }
                  return { ...current, messages, updatedAt: Date.now() };
                });
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
                updateSession(sessionId, (current) => {
                  const messages = [...current.messages];
                  const lastMsg = messages[messages.length - 1];
                  if (lastMsg?.role === 'assistant' && lastMsg.contentParts) {
                    const parts = [...lastMsg.contentParts];
                    // Find the tool call from the end
                    for (let i = parts.length - 1; i >= 0; i--) {
                      if (parts[i].type === 'tool' && parts[i].tool?.id === data.toolCallId) {
                        parts[i].tool!.result = data.output;
                        break;
                      }
                    }
                    lastMsg.contentParts = parts;
                  }
                  return { ...current, messages, updatedAt: Date.now() };
                });
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

      updateSession(sessionId, (current) => {
        const queue = current.queuedMessages || [];
        const hasQueued = queue.length > 0;

        // Process next queued message after state update
        if (hasQueued) {
          const [nextMessage, ...remaining] = queue;
          setTimeout(() => sendMessage(sessionId, nextMessage), 100);
          
          return {
            ...current,
            queuedMessages: remaining,
            status: 'sending',
            error: null,
            updatedAt: Date.now(),
            hasUnread: shouldMarkUnread ? true : false,
          };
        }

        return {
          ...current,
          status: 'idle',
          error: null,
          updatedAt: Date.now(),
          hasUnread: shouldMarkUnread ? true : false,
        };
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
        updateSession(sessionId, (current) => ({
          ...current,
          status: 'idle',
          updatedAt: Date.now(),
        }));
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
      updateSession(sessionId, (current) => ({
        ...current,
        status: 'error',
        error: errorMessage,
        messages: [...current.messages, { role: 'system', content: `Error: ${errorMessage}` }],
        updatedAt: Date.now(),
        hasUnread: shouldMarkUnread ? true : false,
      }));
      if (shouldMarkUnread) {
        showToast(`Message failed for ${session.agentName} (${session.title})`, sessionId);
      }
    }
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
            
            updateSession(activeSessionId, (current) => ({
              ...current,
              input: '',
              model: selectedModel.id,
              inputHistory: [...current.inputHistory, `/model ${selectedModel.name}`],
              messages: isAlreadyActive ? current.messages : [...current.messages, { role: 'system', content: `Model changed to **${selectedModel.name}**` }],
            }));
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
            updateSession(activeSessionId, (current) => ({
              ...current,
              input: '/model ',
            }));
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
        updateSession(activeSessionId, (current) => ({
          ...current,
          input: '',
        }));
        setShowModelSelector(false);
        setShowCommandAutocomplete(false);
        return;
      }
    }

    // Handle backspace in model selector to go back to command autocomplete
    if (showModelSelector && event.key === 'Backspace') {
      if (activeSession?.input === '/model ') {
        event.preventDefault();
        updateSession(activeSessionId!, (current) => ({
          ...current,
          input: '/model',
        }));
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

  const getFilteredCommands = () => {
    if (!activeSession) return slashCommands;
    const input = activeSession.input.toLowerCase();
    if (!input.startsWith('/')) return slashCommands;
    return slashCommands.filter(c => 
      c.cmd.toLowerCase().startsWith(input) || 
      c.aliases?.some(a => a.toLowerCase().startsWith(input))
    );
  };

  const switchAgent = (slug: string) => {
    setSelectedAgent(slug);
    setManagementNotice(null);
  };

  const handleLaunchPrompt = useCallback((prompt: AgentQuickPrompt) => {
    if (!currentAgent) return;

    const sessionId = `${currentAgent.slug}:${generateId()}`;
    const conversationId = `tauri-${currentAgent.slug}-${generateId()}`;
    const session: ChatSession = {
      id: sessionId,
      conversationId,
      agentSlug: currentAgent.slug,
      agentName: currentAgent.name,
      title: `Prompt · ${prompt.label}`,
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

    setSessions((prev) => [...prev, session]);
    setActiveSessionId(sessionId);
    setIsDockCollapsed(false);
    setPendingPromptSend({ sessionId, prompt: prompt.prompt });
  }, [currentAgent]);

  const handlePromptSelect = useCallback((prompt: any) => {
    console.log('handlePromptSelect called with:', prompt);
    if (prompt.agent) {
      console.log('Sending to agent:', prompt.agent);
      handleSendToChat(prompt.prompt, prompt.agent);
    } else {
      console.log('No agent specified, showing selector');
      setAgentSelectorModal({
        show: true,
        onSelect: (agentSlug) => {
          setAgentSelectorModal(null);
          handleSendToChat(prompt.prompt, agentSlug);
        }
      });
    }
  }, []);

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
    
    // Update hash for routing
    switch (view.type) {
      case 'workspace':
        window.location.hash = '';
        break;
      case 'settings':
        window.location.hash = '/settings';
        break;
      case 'agent-new':
        window.location.hash = '/agents/new';
        break;
      case 'agent-edit':
        window.location.hash = `/agents/${view.slug}/edit`;
        break;
      case 'tools':
        window.location.hash = `/agents/${view.slug}/tools`;
        break;
      case 'workflows':
        window.location.hash = `/agents/${view.slug}/workflows`;
        break;
      case 'workspace-new':
        window.location.hash = '/workspaces/new';
        break;
      case 'workspace-edit':
        window.location.hash = `/workspaces/${view.slug}/edit`;
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
    console.log('Agent saved, refetching agents...');
    await fetchAgents();
    console.log('Agents refetched, navigating to workspace');
    setSelectedAgent(slug);
    navigateToWorkspace();
    showToast('Agent saved successfully');
  };

  const handleWorkspaceSaved = async (slug: string) => {
    console.log('Workspace saved, refetching workspaces...');
    await fetchWorkspaces();
    console.log('Workspaces refetched, navigating to workspace');
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

  const handleShowChatForCurrentAgent = useCallback(() => {
    openChatForAgent(currentAgent);
  }, [currentAgent, openChatForAgent]);

  const handleSendToChat = useCallback((text: string, agentSlug?: string) => {
    console.log('handleSendToChat called with:', { text, agentSlug, currentAgent: currentAgent?.slug, agents: agents.map(a => a.slug) });
    const targetAgent = agentSlug ? agents.find(a => a.slug === agentSlug) : currentAgent;
    console.log('Target agent:', targetAgent);
    if (!targetAgent) {
      console.log('No target agent found!');
      return;
    }
    // Always create a new session for prompts to ensure clean context
    const session = createChatSession(targetAgent, { source: 'manual', title: `${targetAgent.name} Chat` });
    console.log('New session created:', session.id);
    focusSession(session.id);
    setSessionInput(session.id, text);
    setPendingPromptSend({ sessionId: session.id, prompt: text });
    console.log('Pending prompt set');
  }, [currentAgent, agents]);

  // Render management views
  if (currentView.type !== 'workspace') {
    return (
      <div className="app">
        <Header
          workspaces={workspaces}
          selectedWorkspace={selectedWorkspace}
          activeTabId={activeTabId}
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
          onTabChange={setActiveTabId}
        />

        {globalError && (
          <div className="global-error">
            <span>{globalError}</span>
            <button type="button" onClick={fetchAgents}>
              Retry
            </button>
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
            />
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
        activeTabId={activeTabId}
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
        onTabChange={setActiveTabId}
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
          <button type="button" onClick={fetchAgents}>
            Retry
          </button>
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
                componentId={activeTab?.component || 'work-agent-dashboard'}
                workspace={selectedWorkspace}
                activeTab={activeTab}
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

            <div
              className={`chat-dock ${isDockCollapsed ? 'is-collapsed' : ''} ${isDockMaximized ? 'is-maximized' : ''} ${isDragging ? 'is-dragging' : ''}`}
              style={{ 
                height: isDockCollapsed 
                  ? '43px' 
                  : isDockMaximized 
                    ? `${window.innerHeight - 107}px` 
                    : `${dockHeight}px`
              }}
              ref={chatSectionRef}
            >
              {!isDockCollapsed && !isDockMaximized && (
                <div
                  className="chat-dock__resize-handle"
                  onMouseDown={() => setIsDragging(true)}
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
                  <div
                    style={{
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
                  </div>
                </div>
              </div>

              {!isDockCollapsed && (
                <>
                  <div className="chat-dock__tabs">
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
                          left: 0,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          zIndex: 10,
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                          boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
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
                          right: 0,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          zIndex: 10,
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                          boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
                        }}
                      >
                        →
                      </button>
                    )}
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

                  <div className="chat-dock__body">
                    {activeSession ? (
                      <>
                        {showStatsPanel && (
                          <ConversationStats
                            agentSlug={activeSession.agentSlug}
                            conversationId={activeSession.conversationId}
                            apiBase={API_BASE}
                            isVisible={showStatsPanel}
                            onToggle={() => setShowStatsPanel(!showStatsPanel)}
                            messageCount={activeSession.messages.length}
                            key={`${activeSession.conversationId}-${activeSession.status}`}
                          />
                        )}
                        <div 
                          className="chat-messages"
                          ref={messagesContainerRef}
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
                                const isStreaming = activeSession.status === 'sending' && isLastAssistant;
                                const textContent = msg.contentParts?.filter(p => p.type === 'text').map(p => p.content).join('\n') || msg.content || '';
                                
                                return (
                                  <div key={idx} className={`message ${msg.role}`}>
                                  <div style={{ position: 'relative' }}>
                                    {msg.role === 'assistant' && msg.model && (
                                      <div style={{ 
                                        fontSize: '9px', 
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
                                    {msg.contentParts && msg.contentParts.length > 0 ? (
                                      // Render mixed content inline
                                      msg.contentParts.map((part, partIdx) => (
                                        part.type === 'text' ? (
                                          <ReactMarkdown key={partIdx}>{part.content || ''}</ReactMarkdown>
                                        ) : (
                                          <ToolCallDisplay key={partIdx} toolCall={part.tool!} />
                                        )
                                      ))
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
                            {activeSession.status === 'sending' && activeSession.messages[activeSession.messages.length - 1]?.role !== 'assistant' && (
                              <div className="message assistant">
                                <div style={{ position: 'relative' }}>
                                  <span className="loading-dots" style={{ display: 'inline-block' }}>
                                    <span style={{ animationDelay: '0s' }}>●</span>
                                    <span style={{ animationDelay: '0.2s' }}>●</span>
                                    <span style={{ animationDelay: '0.4s' }}>●</span>
                                  </span>
                                </div>
                              </div>
                            )}
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
                                          
                                          updateSession(activeSessionId, (current) => ({
                                            ...current,
                                            input: '',
                                            model: model.id,
                                            inputHistory: [...current.inputHistory, `/model ${model.name}`],
                                            messages: isAlreadyActive ? current.messages : [...current.messages, { role: 'system', content: `Model changed to **${model.name}**` }],
                                          }));
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
                                          updateSession(activeSessionId, (current) => ({
                                            ...current,
                                            input: '/model ',
                                          }));
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
                                    updateSession(activeSession.id, (current) => ({
                                      ...current,
                                      input: '',
                                    }));
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
                              />
                            </div>
                            <button
                              onClick={() => {
                                setShowCommandAutocomplete(false);
                                sendMessage(activeSession.id);
                              }}
                              disabled={!activeSession.input.trim()}
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
    </div>
  );
}

function AppWithSDK() {
  return (
    <SDKAdapter apiBase={API_BASE}>
      <PermissionManager>
        <EventRouter>
          <App />
        </EventRouter>
      </PermissionManager>
    </SDKAdapter>
  );
}

export default AppWithSDK;
