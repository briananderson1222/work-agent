import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AgentSelector } from './components/AgentSelector';
import { Header } from './components/Header';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { AgentSelectorModal } from './components/AgentSelectorModal';
import { PinDialog } from './components/PinDialog';
import { ShortcutsCheatsheet } from './components/ShortcutsCheatsheet';
import { ChatDock } from './components/ChatDock';
import { useModels } from './contexts/ModelsContext';
import { useApiBase } from './contexts/ApiBaseContext';
import { useConfig, CONFIG_DEFAULTS } from './contexts/ConfigContext';
import { useNavigation } from './contexts/NavigationContext';
import { useToast } from './contexts/ToastContext';
import { useWorkspaces, useWorkspace } from './contexts/WorkspacesContext';
import { useAgents } from './contexts/AgentsContext';
import { useWorkflows } from './contexts/WorkflowsContext';
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut';
import { WorkspaceRenderer } from './workspaces';
import { WorkspaceView } from './views/WorkspaceView';
import { AgentEditorView } from './views/AgentEditorView';
import { WorkspaceEditorView } from './views/WorkspaceEditorView';
import { ToolManagementView } from './views/ToolManagementView';
import { WorkflowManagementView } from './views/WorkflowManagementView';
import { SettingsView } from './views/SettingsView';
import { MonitoringView } from './views/MonitoringView';
import { useAwsAuth } from './hooks/useAwsAuth';
import { setAuthCallback } from './lib/apiClient';
import { getAgentIcon } from './utils/workspace';
import type {
  AgentSummary,
  NavigationView,
} from './types';

import { ApiBaseProvider } from './contexts/ApiBaseContext';

function App() {
  const { apiBase: API_BASE } = useApiBase();
  const availableModels = useModels(API_BASE);
  const agents = useAgents(API_BASE);
  const { selectedAgent, selectedWorkspace, setAgent, setWorkspace, navigate, isDockOpen } = useNavigation();
  const { showToast } = useToast();
  const workspaces = useWorkspaces(API_BASE);
  const selectedWorkspaceData = useWorkspace(API_BASE, selectedWorkspace || '', !!selectedWorkspace);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [agentSelectorModal, setAgentSelectorModal] = useState<{
    show: boolean;
    onSelect: (slug: string) => void;
  } | null>(null);
  
  const appConfig = useConfig(API_BASE);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [managementNotice, setManagementNotice] = useState<string | null>(null);
  const workflowCatalog = useWorkflows(API_BASE);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showShortcutsCheatsheet, setShowShortcutsCheatsheet] = useState(false);
  const [pinDialogResolver, setPinDialogResolver] = useState<((success: boolean) => void) | null>(null);
  const [activeAbortController, setActiveAbortController] = useState<AbortController | null>(null);
  const { authenticate, isAuthenticating, error: authError } = useAwsAuth();
  const [currentView, setCurrentView] = useState<NavigationView>(() => {
    const path = window.location.pathname;
    
    if (path === '/agents') return { type: 'agents' };
    if (path === '/prompts') return { type: 'prompts' };
    if (path === '/integrations') return { type: 'integrations' };
    if (path === '/monitoring') return { type: 'monitoring' };
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
      if (path === '/monitoring') {
        setCurrentView({ type: 'monitoring' });
        return;
      } else if (path === '/settings') {
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

  // Models are now provided by ModelsContext

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
    if (currentAgent?.commands) {
      const customCommands = Object.values(currentAgent.commands).map((cmd: any) => ({
        cmd: `/${cmd.name}`,
        description: cmd.description || 'Custom command',
        isCustom: true,
      }));
      return [...baseCommands, ...customCommands];
    }

    return baseCommands;
  }, [currentAgent]);

  const quickPrompts = currentAgent?.ui?.quickPrompts;
  const workflowShortcuts = currentAgent?.ui?.workflowShortcuts;

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

  // Sessions are loaded automatically via ConversationsContext

  useEffect(() => {
    // Agents auto-load via context
  }, []);

  // Sync font size from config - handled by ChatDock

  // Auto-scroll to bottom when new messages arrive - handled by ChatDock

  // Keyboard shortcuts for navigation (chat shortcuts handled by ChatDock)
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // Cmd/Ctrl + ,: Toggle settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView]);

  // Update scroll button visibility - handled by ChatDock
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

  // Mark sessions as read - handled by ChatDock

  // Drag handling - handled by ChatDock

  // Auto-select first workspace if none selected
  useEffect(() => {
    if (workspaces.length > 0 && !selectedWorkspace && !selectedAgent && currentView.type === 'workspace') {
      setWorkspace(workspaces[0].slug);
    }
  }, [workspaces, selectedWorkspace, selectedAgent, currentView.type, setWorkspace]);

  const handleWorkspaceSelect = async (slug: string, preferredTabId?: string) => {
    try {
      const response = await fetch(`${API_BASE}/workspaces/${slug}`);
      const data = await response.json();
      if (data.success) {
        setWorkspace(slug);
        
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

  // Chat functions - handled by ChatDock
  const removeSession = (sessionId: string) => {
  };

  const focusSession = (sessionId: string) => {
  };

  const ensureManualSession = (agent: AgentSummary) => {
  };

  const sendMessage = async (sessionId: string, overrideContent?: string) => {
  };

  const openChatForAgent = useCallback((agent: AgentSummary | null) => {
  }, []);

  const openConversation = async (conversationId: string, agentSlug: string) => {
  };

  // Navigation functions
  const switchAgent = (slug: string) => {
    setAgent(slug);
    setManagementNotice(null);
  };

  const navigateToView = (view: NavigationView) => {
    setCurrentView(view);
    
    // Update URL based on view type
    if (view.type === 'settings') {
      navigate('/settings');
    } else if (view.type === 'monitoring') {
      navigate('/monitoring');
    } else if (view.type === 'agents') {
      navigate('/agents');
    } else if (view.type === 'agent-new') {
      navigate('/agents/new');
    } else if (view.type === 'agent-edit' && 'slug' in view) {
      navigate(`/agents/${view.slug}/edit`);
    } else if (view.type === 'tools' && 'slug' in view) {
      navigate(`/agents/${view.slug}/tools`);
    } else if (view.type === 'workflows' && 'slug' in view) {
      navigate(`/agents/${view.slug}/workflows`);
    } else if (view.type === 'workspace-new') {
      navigate('/workspaces/new');
    } else if (view.type === 'workspace-edit' && 'slug' in view) {
      navigate(`/workspaces/${view.slug}/edit`);
    }
  };

  const navigateToWorkspace = () => {
    setCurrentView({ type: 'workspace' });
    if (selectedWorkspace) {
      navigate(`/workspaces/${selectedWorkspace}`);
    } else {
      navigate('/');
    }
  };


  // Stub handlers for legacy calls - ChatDock handles all chat operations
  const handleSendToChat = useCallback((text: string, agentSlug?: string, promptLabel?: string) => {
    showToast('Please use the chat dock to send messages');
  }, [showToast]);

  const handlePromptSelect = useCallback((prompt: any) => {
    showToast('Please use the chat dock to send prompts');
  }, [showToast]);

  const handleSettingsSaved = () => {
    showToast('Settings saved successfully');
  };

  // Keyboard shortcuts
  useKeyboardShortcut('app.settings', ',', ['cmd'], 'Toggle settings', useCallback(() => {
    if (currentView.type === 'settings') {
      navigateToWorkspace();
    } else {
      navigateToView({ type: 'settings' });
    }
  }, [currentView.type, navigateToWorkspace, navigateToView]));

  useKeyboardShortcut('app.newWorkspace', 'n', ['cmd'], 'New workspace', useCallback(() => {
    navigateToView({ type: 'workspace-new' });
  }, [navigateToView]));

  useKeyboardShortcut('app.shortcuts', '/', ['cmd'], 'Show keyboard shortcuts', useCallback(() => {
    setShowShortcutsCheatsheet(true);
  }, []));


  // Render management views
  if (currentView.type !== 'workspace') {
    return (
      <div className="app">
        <Header
          workspaces={workspaces}
          selectedWorkspace={selectedWorkspaceData}
          currentView={currentView}
          onWorkspaceSelect={handleWorkspaceSelect}
          onCreateWorkspace={() => navigateToView({ type: 'workspace-new' })}
          onEditWorkspace={(slug) => navigateToView({ type: 'workspace-edit', slug })}
          onNavigate={navigateToView}
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
          {currentView.type === 'agents' && (
            <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h1 style={{ margin: 0 }}>Agents</h1>
                <button className="button button--primary" onClick={() => navigateToView({ type: 'agent-new' })}>
                  + New Agent
                </button>
              </div>
              <div style={{ display: 'grid', gap: '12px' }}>
                {agents.map(agent => (
                  <div key={agent.slug} style={{ 
                    padding: '16px', 
                    border: '1px solid var(--border-primary)', 
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>{agent.name}</div>
                      {agent.description && <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{agent.description}</div>}
                    </div>
                    <button className="button button--secondary" onClick={() => navigateToView({ type: 'agent-edit', slug: agent.slug })}>
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {currentView.type === 'prompts' && (
            <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
              <h1>Prompts</h1>
              <p style={{ color: 'var(--text-secondary)' }}>Manage global prompts and quick actions.</p>
            </div>
          )}
          {currentView.type === 'integrations' && (
            <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
              <h1>Integrations</h1>
              <p style={{ color: 'var(--text-secondary)' }}>Manage MCP tools and integrations.</p>
            </div>
          )}
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
              chatFontSize={14}
              onChatFontSizeChange={() => {}}
            />
          )}
          {currentView.type === 'monitoring' && <MonitoringView />}
        </div>

        <ChatDock onRequestAuth={handleAuthError} />
      </div>
    );
  }

  // Workspace view
  if (currentView.type === 'workspace') {
    return (
    <div className="app">
      <Header
        workspaces={workspaces}
        selectedWorkspace={selectedWorkspaceData}
        currentView={currentView}
        onWorkspaceSelect={handleWorkspaceSelect}
        onCreateWorkspace={() => navigateToView({ type: 'workspace-new' })}
        onEditWorkspace={(slug) => navigateToView({ type: 'workspace-edit', slug })}
        onNavigate={navigateToView}
        onToggleSettings={() => {
          if (currentView.type === 'settings') {
            navigateToWorkspace();
          } else {
            navigateToView({ type: 'settings' });
          }
        }}
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

      <ShortcutsCheatsheet 
        isOpen={showShortcutsCheatsheet} 
        onClose={() => setShowShortcutsCheatsheet(false)} 
      />

      <div className="main-content">
        <div 
          className={`workspace-panel ${isDockOpen ? 'has-chat-dock' : ''}`}
          style={{ paddingBottom: isDockOpen ? '400px' : '43px' }}
        >
          <WorkspaceView />
        </div>
      </div>

      <ChatDock onRequestAuth={handleAuthError} />
    </div>
    );
  }

  // This should never be reached
  return null;
}

function AppWithSDK() {
  return (
    <ApiBaseProvider>
      <App />
    </ApiBaseProvider>
  );
}

export default AppWithSDK;
