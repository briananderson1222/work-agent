import { useState, useEffect, useRef, useMemo } from 'react';
import type { KeyboardEvent } from 'react';
import { AgentSelector } from './components/AgentSelector';
import { QuickActionsBar } from './components/QuickActionsBar';
import { WorkspaceRenderer } from './workspaces';
import type {
  AgentSummary,
  AgentQuickPrompt,
  ChatMessage,
  ChatSession,
  WorkflowMetadata,
} from './types';

const API_BASE = 'http://localhost:3141';

function App() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [managementNotice, setManagementNotice] = useState<string | null>(null);
  const [workflowCatalog, setWorkflowCatalog] = useState<Record<string, WorkflowMetadata[]>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
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
    }
  }, [isDockCollapsed, activeSessionId]);

  const fetchAgents = async () => {
    try {
      const response = await fetch(`${API_BASE}/agents`);
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
    const existing = sessions.find(
      (session) => session.agentSlug === agent.slug && session.source === 'manual'
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
  };

  const sendMessage = async (sessionId: string, overrideContent?: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;

    const text = (overrideContent ?? session.input).trim();
    if (!text || session.status === 'sending') return;

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
      const response = await fetch(`${API_BASE}/agents/${session.agentSlug}/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: [...session.messages, userMessage].map((message) => ({
            role: message.role,
            content: message.content,
          })),
          options: {
            userId: 'tauri-ui-user',
            conversationId: session.conversationId,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.data?.text || data.text || 'No response',
      };

      const shouldMarkUnread = sessionId !== activeSessionId || isDockCollapsed;

      updateSession(sessionId, (current) => ({
        ...current,
        messages: [...current.messages, assistantMessage],
        status: 'idle',
        error: null,
        updatedAt: Date.now(),
        hasUnread: shouldMarkUnread ? true : false,
      }));

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
      }
    }
  };

  const switchAgent = (slug: string) => {
    setSelectedAgent(slug);
    setManagementNotice(null);
  };

  const handleLaunchPrompt = (prompt: AgentQuickPrompt) => {
    if (!currentAgent) return;

    const existing = sessions.find(
      (session) =>
        session.agentSlug === currentAgent.slug &&
        session.source === 'prompt' &&
        session.sourceId === prompt.id
    );

    if (existing) {
      focusSession(existing.id);
      return;
    }

    const session = createChatSession(currentAgent, {
      source: 'prompt',
      sourceId: prompt.id,
      title: `Prompt · ${prompt.label}`,
    });
    focusSession(session.id);

    setTimeout(() => {
      sendMessage(session.id, prompt.prompt);
    }, 0);
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

  const notifyManagementAction = (message: string) => {
    setManagementNotice(message);
  };

  const handleCreateAgentAction = () => {
    notifyManagementAction('Agent creation UI is coming soon. Use the CLI or edit .work-agent files for now.');
  };

  const handleEditAgentAction = (slug: string) => {
    notifyManagementAction(`Editing agent "${slug}" will be available soon. Edit .work-agent/agents/${slug}/agent.json meanwhile.`);
  };

  const handleManageToolsAction = (slug: string) => {
    notifyManagementAction(`Tool management UI for "${slug}" is coming soon. Update .work-agent/tools/ directly for now.`);
  };

  const handleManageWorkflowsAction = (slug: string) => {
    notifyManagementAction(`Workflow management for "${slug}" is coming soon. Edit .work-agent/agents/${slug}/workflows/ to make changes.`);
  };

  const openChatForAgent = (agent: AgentSummary | null) => {
    if (!agent) return;
    ensureManualSession(agent);
  };

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
            <div className="workspace-panel">
              <WorkspaceRenderer
                agent={currentAgent}
                onLaunchPrompt={handleLaunchPrompt}
                onShowChat={() => openChatForAgent(currentAgent)}
              />
            </div>

            <div
              className={`chat-dock ${isDockCollapsed ? 'is-collapsed' : ''}`}
              ref={chatSectionRef}
            >
              <div className="chat-dock__header">
                <div className="chat-dock__title">
                  <span>Chat Dock</span>
                  {activeSession && (
                    <span className="chat-dock__subtitle">{activeSession.agentName}</span>
                  )}
                </div>
                <div className="chat-dock__header-actions">
                  <span className="chat-dock__counter">
                    {sessions.length} session{sessions.length === 1 ? '' : 's'}
                  </span>
                  {unreadCount > 0 && <span className="chat-dock__badge">{unreadCount}</span>}
                  <button type="button" onClick={() => setIsDockCollapsed((prev) => !prev)}>
                    {isDockCollapsed ? 'Expand' : 'Collapse'}
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
                                {msg.content}
                              </div>
                            ))
                          )}
                          <div ref={messagesEndRef} />
                        </div>
                        <div className="chat-input-container">
                          {activeSession.error && <div className="error">{activeSession.error}</div>}
                          <div className="chat-input">
                            <textarea
                              ref={textareaRef}
                              value={activeSession.input}
                              onChange={(event) =>
                                setSessionInput(activeSession.id, event.target.value)
                              }
                              onKeyDown={handleKeyDown}
                              placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                              disabled={activeSession.status === 'sending'}
                            />
                            <button
                              onClick={() => sendMessage(activeSession.id)}
                              disabled={
                                activeSession.status === 'sending' ||
                                !activeSession.input.trim()
                              }
                            >
                              {activeSession.status === 'sending' ? 'Sending...' : 'Send'}
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
