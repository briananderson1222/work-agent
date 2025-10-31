import { useState, useEffect, useRef, useMemo } from 'react';
import type { KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { AgentSelector } from './components/AgentSelector';
import { QuickActionsBar } from './components/QuickActionsBar';
import { ThemeToggle } from './components/ThemeToggle';
import { WorkspaceRenderer } from './workspaces';
import { AgentEditorView } from './views/AgentEditorView';
import { ToolManagementView } from './views/ToolManagementView';
import { WorkflowManagementView } from './views/WorkflowManagementView';
import { SettingsView } from './views/SettingsView';
import type {
  AgentSummary,
  AgentQuickPrompt,
  ChatMessage,
  ChatSession,
  WorkflowMetadata,
  NavigationView,
} from './types';

const API_BASE = 'http://localhost:3141';

function ToolCallDisplay({ toolCall }: { toolCall: { toolCallId: string; toolName: string; args: any; result?: any; state?: string; error?: string } }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="tool-call">
      <button 
        className="tool-call__header" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="tool-call__icon">🔧</span>
        <span className="tool-call__name">{toolCall.toolName}</span>
        {toolCall.error && <span className="tool-call__error">⚠️</span>}
        <span className="tool-call__toggle">{isExpanded ? '▼' : '▶'}</span>
      </button>
      {isExpanded && (
        <div className="tool-call__details">
          <div className="tool-call__section">
            <strong>Tool ID:</strong>
            <pre>{toolCall.toolCallId}</pre>
          </div>
          <div className="tool-call__section">
            <strong>Arguments:</strong>
            <pre>{JSON.stringify(toolCall.args, null, 2)}</pre>
          </div>
          {toolCall.state && (
            <div className="tool-call__section">
              <strong>State:</strong>
              <pre>{toolCall.state}</pre>
            </div>
          )}
          {toolCall.result && (
            <div className="tool-call__section">
              <strong>Result:</strong>
              <pre>{JSON.stringify(toolCall.result, null, 2)}</pre>
            </div>
          )}
          {toolCall.error && (
            <div className="tool-call__section tool-call__section--error">
              <strong>Error:</strong>
              <pre>{toolCall.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function App() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/agent\/([^/]+)/);
    return match ? match[1] : null;
  });
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('session');
  });
  const [isDockCollapsed, setIsDockCollapsed] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('dock') !== 'open';
  });
  const [dockHeight, setDockHeight] = useState(400);
  const [isDragging, setIsDragging] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [managementNotice, setManagementNotice] = useState<string | null>(null);
  const [workflowCatalog, setWorkflowCatalog] = useState<Record<string, WorkflowMetadata[]>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
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
    
    return { type: 'workspace' };
  });
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [pendingPromptSend, setPendingPromptSend] = useState<{ sessionId: string; prompt: string } | null>(null);
  const [loadedAgents, setLoadedAgents] = useState<Set<string>>(new Set());
  const [messageQueue, setMessageQueue] = useState<Map<string, string[]>>(new Map());
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generateId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  const humanizeWorkflowId = (identifier: string) => {
    const base = identifier.includes('.') ? identifier.split('.')[0] : identifier;
    return base.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 5000);
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);

  const currentAgent = useMemo(
    () => agents.find((agent) => agent.slug === selectedAgent) ?? null,
    [agents, selectedAgent]
  );
  const quickPrompts = currentAgent?.ui?.quickPrompts;
  const workflowShortcuts = currentAgent?.ui?.workflowShortcuts;
  const activeSession = activeSessionId
    ? sessions.find((session) => session.id === activeSessionId) ?? null
    : null;
  const unreadCount = sessions.filter((session) => session.hasUnread).length;

  // Update URL when state changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeSessionId) params.set('session', activeSessionId);
    if (!isDockCollapsed) params.set('dock', 'open');
    
    let path = '/';
    
    if (currentView.type === 'workspace' && selectedAgent) {
      path = `/agent/${selectedAgent}`;
    } else if (currentView.type === 'settings') {
      path = '/settings';
    } else if (currentView.type === 'agent-new') {
      path = '/agents/new';
    } else if (currentView.type === 'agent-edit') {
      path = `/agents/${currentView.slug}/edit`;
    } else if (currentView.type === 'tools') {
      path = `/agents/${currentView.slug}/tools`;
    } else if (currentView.type === 'workflows') {
      path = `/agents/${currentView.slug}/workflows`;
    }
    
    const query = params.toString();
    const url = query ? `${path}?${query}` : path;
    
    window.history.replaceState({}, '', url);
  }, [selectedAgent, activeSessionId, isDockCollapsed, currentView]);

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
  }, []);

  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[sessions.length - 1].id);
    }
  }, [sessions, activeSessionId]);

  useEffect(() => {
    if (!activeSessionId || isDockCollapsed) return;
    const session = sessions.find((item) => item.id === activeSessionId);
    if (!session) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSessionId, sessions, isDockCollapsed]);

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

  const fetchAgents = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/agents`);
      if (!response.ok) throw new Error('Failed to fetch agents');

      const payload = await response.json();
      const agentList: AgentSummary[] = (payload.data || []).map((agent: any) => ({
        slug: agent.slug ?? agent.id,
        name: agent.name,
        model: agent.model,
        updatedAt: agent.updatedAt,
        description: agent.description,
        ui: agent.ui,
        workflowWarnings: agent.workflowWarnings || undefined,
      }));

      setAgents(agentList);
      setGlobalError(null);

      if (agentList.length > 0 && !selectedAgent) {
        setSelectedAgent(agentList[0].slug);
      }
    } catch (err: any) {
      setGlobalError(err.message);
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
    };

    setSessions((prev) => [...prev, session]);
    return session;
  };

  const ensureManualSession = (agent: AgentSummary) => {
    const session = createChatSession(agent, { source: 'manual', title: `${agent.name} Chat` });
    focusSession(session.id);
    return session;
  };

  const setSessionInput = (sessionId: string, value: string) => {
    updateSession(sessionId, (current) => ({
      ...current,
      input: value,
    }));
  };

  const sendMessage = async (sessionId: string, overrideContent?: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;

    const text = (overrideContent ?? session.input).trim();
    if (!text) return;

    // If already sending, queue the message
    if (session.status === 'sending') {
      updateSession(sessionId, (current) => ({
        ...current,
        queuedMessages: [...(current.queuedMessages || []), text],
        input: overrideContent ? current.input : '',
      }));
      return;
    }

    const userMessage: ChatMessage = { role: 'user', content: text };

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

    try {
      // Send only the new user message - VoltAgent Memory will handle history
      const response = await fetch(`${API_BASE}/agents/${session.agentSlug}/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text,
          options: {
            userId: 'tauri-ui-user',
            conversationId: session.conversationId,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.data?.text || data.text || 'No response',
        toolCalls: data.data?.toolCalls?.map((tc: any) => ({
          id: tc.toolCallId,
          name: tc.toolName,
          args: tc.args,
          result: data.data?.toolResults?.find((tr: any) => tr.toolCallId === tc.toolCallId)?.result,
        })),
      };

      const shouldMarkUnread = sessionId !== activeSessionId || isDockCollapsed;

      updateSession(sessionId, (current) => {
        const queue = current.queuedMessages || [];
        const hasQueued = queue.length > 0;

        // Process next queued message after state update
        if (hasQueued) {
          const [nextMessage, ...remaining] = queue;
          setTimeout(() => sendMessage(sessionId, nextMessage), 100);
          
          return {
            ...current,
            messages: [...current.messages, assistantMessage],
            queuedMessages: remaining,
            status: 'sending',
            error: null,
            updatedAt: Date.now(),
            hasUnread: shouldMarkUnread ? true : false,
          };
        }

        return {
          ...current,
          messages: [...current.messages, assistantMessage],
          status: 'idle',
          error: null,
          updatedAt: Date.now(),
          hasUnread: shouldMarkUnread ? true : false,
        };
      });

      if (shouldMarkUnread) {
        showToast(`New response from ${session.agentName} (${session.title})`);
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to send message';
      const shouldMarkUnread = sessionId !== activeSessionId || isDockCollapsed;
      updateSession(sessionId, (current) => ({
        ...current,
        status: 'error',
        error: errorMessage,
        messages: [...current.messages, { role: 'system', content: `Error: ${errorMessage}` }],
        updatedAt: Date.now(),
        hasUnread: shouldMarkUnread ? true : false,
      }));
      if (shouldMarkUnread) {
        showToast(`Message failed for ${session.agentName} (${session.title})`);
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (activeSessionId) {
        sendMessage(activeSessionId);
        setHistoryIndex(-1);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!activeSession) return;
      const userMessages = activeSession.messages.filter(m => m.role === 'user');
      if (userMessages.length === 0) return;
      const newIndex = historyIndex + 1;
      if (newIndex < userMessages.length) {
        setHistoryIndex(newIndex);
        setSessionInput(activeSession.id, userMessages[userMessages.length - 1 - newIndex].content);
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!activeSession) return;
      const userMessages = activeSession.messages.filter(m => m.role === 'user');
      const newIndex = historyIndex - 1;
      if (newIndex >= 0) {
        setHistoryIndex(newIndex);
        setSessionInput(activeSession.id, userMessages[userMessages.length - 1 - newIndex].content);
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

  const handleLaunchPrompt = (prompt: AgentQuickPrompt) => {
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
  };

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
    await fetchAgents();
    setSelectedAgent(slug);
    navigateToWorkspace();
    showToast('Agent saved successfully');
  };

  const handleSettingsSaved = () => {
    showToast('Settings saved successfully');
  };

  const openChatForAgent = (agent: AgentSummary | null) => {
    if (!agent) return;
    ensureManualSession(agent);
  };

  // Render management views
  if (currentView.type !== 'workspace') {
    return (
      <div className="app">
        <header className="app-toolbar">
          <div className="app-toolbar__title">Work Agent</div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <ThemeToggle />
            <button
              type="button"
              className="button button--secondary"
              onClick={() => navigateToView({ type: 'settings' })}
            >
              Settings
            </button>
          </div>
        </header>

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
              onBack={navigateToWorkspace}
              onSaved={handleAgentSaved}
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
            />
          )}
        </div>

        {toastMessage && (
          <div className="toast">
            <span>{toastMessage}</span>
            <button type="button" onClick={() => setToastMessage(null)}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    );
  }

  // Render workspace view
  return (
    <div className="app">
      <header className="app-toolbar">
        <AgentSelector
          agents={agents}
          selectedAgent={currentAgent}
          onSelect={switchAgent}
          onCreateAgent={handleCreateAgentAction}
          onEditAgent={handleEditAgentAction}
          onManageTools={handleManageToolsAction}
          onManageWorkflows={handleManageWorkflowsAction}
        />

        {currentAgent ? (
          <QuickActionsBar
            prompts={quickPrompts}
            workflowShortcuts={workflowShortcuts}
            onPromptSelect={handleLaunchPrompt}
            onWorkflowSelect={handleWorkflowShortcut}
            workflowMetadata={workflowCatalog[currentAgent.slug]}
          />
        ) : (
          <div className="quick-actions quick-actions--placeholder">
            <span>Select an agent to access quick actions.</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <ThemeToggle />
          <button
            type="button"
            className="button button--secondary app-toolbar__settings"
            onClick={() => navigateToView({ type: 'settings' })}
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

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
        {currentAgent ? (
          <>
            <div className={`workspace-panel ${!isDockCollapsed ? 'has-chat-dock' : ''}`}>
              <WorkspaceRenderer
                agent={currentAgent}
                onLaunchPrompt={handleLaunchPrompt}
                onShowChat={() => openChatForAgent(currentAgent)}
              />
            </div>

            <div
              className={`chat-dock ${isDockCollapsed ? 'is-collapsed' : ''}`}
              style={{ height: isDockCollapsed ? '37px' : `${dockHeight}px` }}
              ref={chatSectionRef}
            >
              {!isDockCollapsed && (
                <div
                  className="chat-dock__resize-handle"
                  onMouseDown={() => setIsDragging(true)}
                />
              )}
              <div className="chat-dock__header" onClick={() => setIsDockCollapsed((prev) => !prev)}>
                <div className="chat-dock__title">
                  <span>Chat Dock</span>
                </div>
                <div className="chat-dock__header-actions">
                  <span className="chat-dock__counter">
                    {sessions.length} session{sessions.length === 1 ? '' : 's'}
                  </span>
                  {unreadCount > 0 && <span className="chat-dock__badge">{unreadCount}</span>}
                </div>
              </div>

              {!isDockCollapsed && (
                <>
                  <div className="chat-dock__tabs">
                    <div className="chat-dock__tab-list">
                      {sessions.map((session) => (
                        <button
                          type="button"
                          key={session.id}
                          className={`chat-dock__tab ${
                            session.id === activeSessionId ? 'is-active' : ''
                          } ${session.hasUnread ? 'has-unread' : ''}`}
                          onClick={() => focusSession(session.id)}
                        >
                          <span className="chat-dock__tab-title">{session.title}</span>
                          <span className="chat-dock__tab-agent">{session.agentName}</span>
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
                          >
                            ×
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="chat-dock__new"
                      onClick={() => openChatForAgent(currentAgent)}
                      disabled={!currentAgent}
                    >
                      + New
                    </button>
                  </div>

                  <div className="chat-dock__body">
                    {activeSession ? (
                      <>
                        <div className="chat-messages">
                          {activeSession.messages.length === 0 ? (
                            <div className="empty-state">
                              <h3>Start a conversation</h3>
                              <p>Type a message below to chat with {activeSession.agentName}</p>
                            </div>
                          ) : (
                            activeSession.messages.map((msg, idx) => (
                              <div key={idx} className={`message ${msg.role}`}>
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                                {msg.toolCalls && msg.toolCalls.length > 0 && (
                                  <div className="tool-calls">
                                    {msg.toolCalls.map((tc) => (
                                      <ToolCallDisplay key={tc.toolCallId} toolCall={tc} />
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                          {activeSession.status === 'sending' && (
                            <div className="message assistant loading">
                              <span className="loading-dots">
                                <span style={{ animationDelay: '0s' }}>●</span>
                                <span style={{ animationDelay: '0.2s' }}>●</span>
                                <span style={{ animationDelay: '0.4s' }}>●</span>
                              </span>
                            </div>
                          )}
                          <div ref={messagesEndRef} />
                        </div>
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
                          <div className="chat-input">
                            <textarea
                              ref={textareaRef}
                              value={activeSession.input}
                              onChange={(event) =>
                                setSessionInput(activeSession.id, event.target.value)
                              }
                              onKeyDown={handleKeyDown}
                              placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                            />
                            <button
                              onClick={() => sendMessage(activeSession.id)}
                              disabled={!activeSession.input.trim()}
                            >
                              Send
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="chat-dock__empty">
                        <p>No active sessions. Start a new chat to begin.</p>
                        <button
                          type="button"
                          onClick={() => openChatForAgent(currentAgent)}
                          disabled={!currentAgent}
                        >
                          New Session
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h3>No agent selected</h3>
            <p>Choose an agent from the selector to load its workspace.</p>
          </div>
        )}
      </div>

      {toastMessage && (
        <div className="toast">
          <span>{toastMessage}</span>
          <button type="button" onClick={() => setToastMessage(null)}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
