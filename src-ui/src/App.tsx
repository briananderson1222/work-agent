import { useState, useEffect, useRef, useMemo } from 'react';
import type { KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { invoke } from '@tauri-apps/api/core';
import { AgentSelector } from './components/AgentSelector';
import { QuickActionsBar } from './components/QuickActionsBar';
import { ThemeToggle } from './components/ThemeToggle';
import { PinDialog } from './components/PinDialog';
import { WorkspaceRenderer } from './workspaces';
import { AgentEditorView } from './views/AgentEditorView';
import { ToolManagementView } from './views/ToolManagementView';
import { WorkflowManagementView } from './views/WorkflowManagementView';
import { SettingsView } from './views/SettingsView';
import { useAwsAuth } from './hooks/useAwsAuth';
import { setAuthCallback, apiRequest } from './lib/apiClient';
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
            <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '2px', overflow: 'auto' }}>{toolCall.id}</pre>
          </div>
          <div className="tool-call__section">
            <strong>Arguments:</strong>
            <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '2px', overflow: 'auto' }}>{JSON.stringify(toolCall.args, null, 2)}</pre>
          </div>
          {toolCall.result && (
            <div className="tool-call__section">
              <strong>Result:</strong>
              <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '2px', overflow: 'auto', maxHeight: '200px' }}>{JSON.stringify(toolCall.result, null, 2)}</pre>
            </div>
          )}
          {toolCall.error && (
            <div className="tool-call__section tool-call__section--error">
              <strong>Error:</strong>
              <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '2px', overflow: 'auto', color: 'red' }}>{toolCall.error}</pre>
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
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinDialogResolver, setPinDialogResolver] = useState<((success: boolean) => void) | null>(null);
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
    setShowPinDialog(false);
    pinDialogResolver?.(success);
    setPinDialogResolver(null);
  };

  const handlePinCancel = () => {
    setShowPinDialog(false);
    pinDialogResolver?.(false);
    setPinDialogResolver(null);
  };

  // Update URL when state changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeSessionId) params.set('session', activeSessionId);
    if (!isDockCollapsed) params.set('dock', 'open');
    if (isDockMaximized) params.set('maximize', 'true');
    
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
  }, [selectedAgent, activeSessionId, isDockCollapsed, isDockMaximized, currentView]);

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
      // Use streaming /chat endpoint to see tool calls
      const response = await fetch(`${API_BASE}/agents/${session.agentSlug}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text,
          options: {
            userId: 'tauri-ui-user',
            conversationId: session.conversationId,
            maxSteps: 10,
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
                      contentParts: [{ type: 'text', content: currentTextChunk }]
                    });
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
                      contentParts: [{ type: 'tool', tool: toolCall }]
                    });
                  }
                  return { ...current, messages, updatedAt: Date.now() };
                });
              } else if (data.type === 'tool-output-available') {
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
            <div 
              className={`workspace-panel ${!isDockCollapsed ? 'has-chat-dock' : ''}`}
              style={{ paddingBottom: isDockCollapsed ? '37px' : `${dockHeight}px` }}
            >
              <WorkspaceRenderer
                agent={currentAgent}
                onLaunchPrompt={handleLaunchPrompt}
                onShowChat={() => openChatForAgent(currentAgent)}
              />
            </div>

            <div
              className={`chat-dock ${isDockCollapsed ? 'is-collapsed' : ''} ${isDockMaximized ? 'is-maximized' : ''}`}
              style={{ 
                height: isDockCollapsed ? '37px' : isDockMaximized ? `${window.innerHeight - 107}px` : `${dockHeight}px`
              }}
              ref={chatSectionRef}
            >
              {!isDockCollapsed && !isDockMaximized && (
                <div
                  className="chat-dock__resize-handle"
                  onMouseDown={() => setIsDragging(true)}
                />
              )}
              <div className="chat-dock__header" style={{
                ...(isDockMaximized && {
                  background: 'rgba(var(--color-primary-rgb, 59, 130, 246), 0.1)',
                  borderBottom: '2px solid var(--color-primary)'
                })
              }}>
                <div className="chat-dock__title" onClick={() => setIsDockCollapsed((prev) => !prev)} style={{ cursor: 'pointer', flex: 1 }}>
                  <span>Chat Dock</span>
                </div>
                <div className="chat-dock__header-actions">
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
                      fontSize: '1rem'
                    }}
                    title={isDockMaximized ? 'Restore' : 'Maximize'}
                  >
                    {isDockMaximized ? '⬇' : '⬆'}
                  </button>
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

      {showPinDialog && (
        <PinDialog
          onSubmit={handlePinSubmit}
          onCancel={handlePinCancel}
          isLoading={isAuthenticating}
          error={authError}
        />
      )}
    </div>
  );
}

export default App;
