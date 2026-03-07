import { useWorkspaceQuery, useWorkspacesQuery } from '@stallion-ai/sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ACPConnectionsSection } from './components/ACPConnectionsSection';
import { AgentIcon } from './components/AgentIcon';
import { ChatDock } from './components/ChatDock';
import { Header } from './components/Header';
import { ShortcutsCheatsheet } from './components/ShortcutsCheatsheet';
import { useAgents } from './contexts/AgentsContext';
import { useApiBase } from './contexts/ApiBaseContext';
import { useConfig } from './contexts/ConfigContext';
import { useModels } from './contexts/ModelsContext';
import { useNavigation } from './contexts/NavigationContext';
import { useToast } from './contexts/ToastContext';
import { useWorkflows } from './contexts/WorkflowsContext';
import { useExternalAuth } from './hooks/useExternalAuth';
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut';
import { useServerEvents } from './hooks/useServerEvents';
import { useSystemStatus } from './hooks/useSystemStatus';
import { setAuthCallback } from './lib/apiClient';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import type { AgentSummary, NavigationView } from './types';
import { GlobalVoiceButton } from './components/GlobalVoiceButton';
import { AgentEditorView } from './views/AgentEditorView';
import { MonitoringView } from './views/MonitoringView';
import { PluginManagementView } from './views/PluginManagementView';
import { ScheduleView } from './views/ScheduleView';
import { ManageView } from './views/ManageView';
import { WorkspacesView } from './views/WorkspacesView';
import { AgentsView } from './views/AgentsView';
import { PromptsView } from './views/PromptsView';
import { SettingsView } from './views/SettingsView';
import { ToolManagementView } from './views/ToolManagementView';
import { ToolsView } from './views/ToolsView';
import { WorkflowManagementView } from './views/WorkflowManagementView';
import { WorkspaceEditorView } from './views/WorkspaceEditorView';
import { WorkspaceView } from './views/WorkspaceView';

function App() {
  const { apiBase: API_BASE } = useApiBase();
  const availableModels = useModels();
  const agents = useAgents();

  // SSE event stream — replaces all polling for ACP status, agent changes, etc.
  useServerEvents();
  const {
    selectedAgent,
    selectedWorkspace,
    lastWorkspace,
    setWorkspace,
    setWorkspaceTab,
    navigate,
  } = useNavigation();
  const { showToast } = useToast();
  const { data: workspaces = [] } = useWorkspacesQuery();
  const { data: selectedWorkspaceData } = useWorkspaceQuery(
    selectedWorkspace || '',
    { enabled: !!selectedWorkspace },
  );
  const [activeTabId, setActiveTabId] = useState<string>('');
  const appConfig = useConfig();
  const [globalError, _setGlobalError] = useState<string | null>(null);
  const [managementNotice, setManagementNotice] = useState<string | null>(null);
  useWorkflows(API_BASE);
  const [showShortcutsCheatsheet, setShowShortcutsCheatsheet] = useState(false);
  useExternalAuth();
  const { data: systemStatus } = useSystemStatus();
  const [currentView, setCurrentView] = useState<NavigationView>(() => {
    const path = window.location.pathname;

    if (path === '/manage') return { type: 'manage' };
    if (path === '/manage/agents') return { type: 'agents' };
    if (path === '/manage/workspaces') return { type: 'workspaces' };
    if (path === '/manage/prompts') return { type: 'prompts' };
    if (path === '/manage/plugins') return { type: 'plugins' };
    if (path === '/manage/tools') return { type: 'tools' };
    if (path === '/sys/monitoring') return { type: 'monitoring' };
    if (path === '/sys/schedule') return { type: 'schedule' };
    if (path === '/sys/settings') return { type: 'settings' };
    if (path === '/profile') return { type: 'profile' };
    if (path === '/notifications') return { type: 'notifications' };
    // Legacy redirects
    if (path === '/agents' || path === '/agents/new') return { type: 'agents' };
    if (path === '/prompts') return { type: 'prompts' };
    if (path === '/plugins') return { type: 'plugins' };
    if (path === '/tools') return { type: 'tools' };
    if (path === '/monitoring') return { type: 'monitoring' };
    if (path === '/schedule') return { type: 'schedule' };
    if (path === '/settings') return { type: 'settings' };
    if (path.startsWith('/agents/') && path.endsWith('/edit')) {
      return { type: 'agents' };
    }
    if (path.startsWith('/agents/') && path.endsWith('/tools')) {
      const slug = path.split('/')[2];
      return { type: 'agent-tools', slug };
    }
    if (path.startsWith('/agents/') && path.endsWith('/workflows')) {
      const slug = path.split('/')[2];
      return { type: 'workflows', slug };
    }
    if (path === '/workspaces/new') return { type: 'workspaces' };
    if (path.startsWith('/workspaces/') && path.endsWith('/edit')) {
      return { type: 'workspaces' };
    }

    return { type: 'workspace' };
  });
  const handleWorkspaceSelect = useCallback(async (
    slug: string,
    preferredTabId?: string,
  ) => {
    const workspace = workspaces.find((w: any) => w.slug === slug);
    if (workspace) {
      const tabs = workspace.tabs || [];
      const validTabId =
        preferredTabId && tabs.find((t: any) => t.id === preferredTabId)
          ? preferredTabId
          : tabs[0]?.id || '';

      setWorkspace(slug);
      setActiveTabId(validTabId);
      setWorkspaceTab(slug, validTabId);
      setCurrentView({ type: 'workspace' });
      navigate(`/workspaces/${slug}`);
    }
  }, [workspaces, setWorkspace, setWorkspaceTab, navigate]);

  // Navigation functions (declared early so useEffect closures can reference them)
  const navigateToView = useCallback((view: NavigationView) => {
    setCurrentView(view);

    // Update URL based on view type
    if (view.type === 'workspace') {
      const target = selectedWorkspace || lastWorkspace;
      if (target && target !== 'new') {
        navigate(`/workspaces/${target}`);
      } else {
        navigate('/');
      }
    } else if (view.type === 'workspaces') {
      navigate('/manage/workspaces');
    } else if (view.type === 'agents') {
      navigate('/manage/agents');
    } else if (view.type === 'prompts') {
      navigate('/manage/prompts');
    } else if (view.type === 'manage') {
      navigate('/manage');
    } else if (view.type === 'plugins') {
      navigate('/manage/plugins');
    } else if (view.type === 'tools') {
      navigate('/manage/tools');
    } else if (view.type === 'profile') {
      navigate('/profile');
    } else if (view.type === 'notifications') {
      navigate('/notifications');
    } else if (view.type === 'settings') {
      navigate('/sys/settings');
    } else if (view.type === 'monitoring') {
      navigate('/sys/monitoring');
    } else if (view.type === 'schedule') {
      navigate('/sys/schedule');
    } else if (view.type === 'agent-new' || view.type === 'agent-edit') {
      navigate('/manage/agents');
    } else if (view.type === 'agent-tools' && 'slug' in view) {
      navigate(`/manage/agents/${view.slug}/tools`);
    } else if (view.type === 'workflows' && 'slug' in view) {
      navigate(`/manage/agents/${view.slug}/workflows`);
    } else if (view.type === 'workspace-new' || view.type === 'workspace-edit') {
      navigate('/manage/workspaces');
    }
  }, [selectedWorkspace, lastWorkspace, navigate]);

  const navigateToWorkspace = useCallback(() => {
    setCurrentView({ type: 'workspace' });
    if (selectedWorkspace) {
      navigate(`/workspaces/${selectedWorkspace}`);
    } else {
      navigate('/');
    }
  }, [selectedWorkspace, navigate]);

  // Listen for path changes (back/forward navigation)
  useEffect(() => {
    const handlePathChange = () => {
      const path = window.location.pathname;

      // Hierarchical routes
      if (path === '/manage') { setCurrentView({ type: 'manage' }); return; }
      if (path === '/manage/agents') { setCurrentView({ type: 'agents' }); return; }
      if (path === '/manage/workspaces') { setCurrentView({ type: 'workspaces' }); return; }
      if (path === '/manage/prompts') { setCurrentView({ type: 'prompts' }); return; }
      if (path === '/manage/plugins') { setCurrentView({ type: 'plugins' }); return; }
      if (path === '/manage/tools') { setCurrentView({ type: 'tools' }); return; }
      if (path === '/sys/monitoring') { setCurrentView({ type: 'monitoring' }); return; }
      if (path === '/sys/schedule') { setCurrentView({ type: 'schedule' }); return; }
      if (path === '/sys/settings') { setCurrentView({ type: 'settings' }); return; }
      if (path === '/profile') { setCurrentView({ type: 'profile' }); return; }
      if (path === '/notifications') { setCurrentView({ type: 'notifications' }); return; }

      // Legacy paths → redirect to new hierarchy
      if (path === '/agents' || path === '/agents/new') { setCurrentView({ type: 'agents' }); return; }
      if (path === '/prompts') { setCurrentView({ type: 'prompts' }); return; }
      if (path === '/plugins') { setCurrentView({ type: 'plugins' }); return; }
      if (path === '/tools') { setCurrentView({ type: 'tools' }); return; }
      if (path === '/monitoring') { setCurrentView({ type: 'monitoring' }); return; }
      if (path === '/schedule') { setCurrentView({ type: 'schedule' }); return; }
      if (path === '/settings') { setCurrentView({ type: 'settings' }); return; }
      if (path.startsWith('/agents/') && path.endsWith('/edit')) { setCurrentView({ type: 'agents' }); return; }
      if (path.startsWith('/agents/') && path.endsWith('/tools')) {
        const slug = path.split('/')[2];
        setCurrentView({ type: 'agent-tools', slug }); return;
      }
      if (path.startsWith('/agents/') && path.endsWith('/workflows')) {
        const slug = path.split('/')[2];
        setCurrentView({ type: 'workflows', slug }); return;
      }
      if (path === '/workspaces/new' || (path.startsWith('/workspaces/') && path.endsWith('/edit'))) {
        setCurrentView({ type: 'workspaces' }); return;
      }

      // Workspace paths
      if (path === '/workspaces') {
        setCurrentView({ type: 'workspaces' });
        return;
      }
      if (path.startsWith('/workspaces/')) {
        const pathParts = path.split('/');
        const workspaceSlug = pathParts[2];
        const tabId = pathParts[3];

        if (workspaceSlug === 'new' || path.endsWith('/edit')) return;

        if (workspaceSlug && workspaceSlug !== selectedWorkspace) {
          handleWorkspaceSelect(workspaceSlug, tabId);
        } else if (tabId && tabId !== activeTabId) {
          setActiveTabId(tabId);
        }
        setCurrentView({ type: 'workspace' });
        return;
      }

      setCurrentView({ type: 'workspace' });
    };

    handlePathChange(); // Initial call
    window.addEventListener('popstate', handlePathChange);
    return () => {
      window.removeEventListener('popstate', handlePathChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const currentAgent = useMemo(
    () => agents.find((agent) => agent.slug === selectedAgent) ?? null,
    [agents, selectedAgent],
  );

  // Setup auth callback
  useEffect(() => {
    const authCallback = async () => Promise.resolve(false);
    setAuthCallback(authCallback);
    (
      globalThis as typeof globalThis & {
        authCallback?: () => Promise<boolean>;
      }
    ).authCallback = authCallback;
  }, []);

  const handleAuthError = async (): Promise<boolean> => Promise.resolve(false);

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
  }, [currentView, navigateToView, navigateToWorkspace]);

  // Update scroll button visibility - handled by ChatDock
  useEffect(() => {
    if (!currentAgent) return;

    // Workflows auto-load via context

    if (
      currentAgent.workflowWarnings &&
      currentAgent.workflowWarnings.length > 0
    ) {
      const warningText = `Missing workflow shortcuts for ${currentAgent.name}: ${currentAgent.workflowWarnings.join(
        ', ',
      )}`;
      setManagementNotice((prev) => prev ?? warningText);
    }
  }, [currentAgent]);

  // Mark sessions as read - handled by ChatDock

  // Drag handling - handled by ChatDock

  // Auto-select workspace if none selected — prefer last-used, fall back to first
  useEffect(() => {
    if (
      workspaces.length > 0 &&
      !selectedWorkspace &&
      !selectedAgent &&
      currentView.type === 'workspace'
    ) {
      const target = lastWorkspace && workspaces.find((w: any) => w.slug === lastWorkspace)
        ? lastWorkspace
        : workspaces[0].slug;
      setWorkspace(target);
    }
  }, [
    workspaces,
    selectedWorkspace,
    selectedAgent,
    currentView.type,
    setWorkspace,
    lastWorkspace,
  ]);



  const handleSettingsSaved = () => {
    showToast('Settings saved successfully');
  };

  const handleAgentSaved = () => {
    showToast('Agent saved successfully');
    navigateToView({ type: 'agents' });
  };

  const handleWorkspaceSaved = () => {
    showToast('Workspace saved successfully');
    navigateToWorkspace();
  };

  // Keyboard shortcuts
  useKeyboardShortcut(
    'app.settings',
    ',',
    ['cmd'],
    'Toggle settings',
    useCallback(() => {
      if (currentView.type === 'settings') {
        navigateToWorkspace();
      } else {
        navigateToView({ type: 'settings' });
      }
    }, [currentView.type, navigateToWorkspace, navigateToView]),
  );

  useKeyboardShortcut(
    'app.newWorkspace',
    'n',
    ['cmd'],
    'New workspace',
    useCallback(() => {
      navigateToView({ type: 'workspace-new' });
    }, [navigateToView]),
  );

  useKeyboardShortcut(
    'app.shortcuts',
    '/',
    ['cmd'],
    'Show keyboard shortcuts',
    useCallback(() => {
      setShowShortcutsCheatsheet(true);
    }, []),
  );

  // Render current view content
  const renderViewContent = () => {
    if (currentView.type === 'workspace') {
      return (
        <>
          {managementNotice && (
            <div className="management-notice">
              <span>{managementNotice}</span>
              <button type="button" onClick={() => setManagementNotice(null)}>
                Close
              </button>
            </div>
          )}
          <WorkspaceView />
        </>
      );
    }

    // Management views
    return (
      <>
        {currentView.type === 'manage' && (
          <ManageView
            workspaceCount={workspaces.length}
            agentCount={agents.length}
            onNavigate={navigateToView}
          />
        )}

        {currentView.type === 'workspaces' && (
          <WorkspacesView />
        )}

        {currentView.type === 'agents' && (
          <AgentsView
            agents={agents}
            apiBase={API_BASE}
            availableModels={availableModels}
            defaultModel={appConfig?.defaultModel}
            bedrockReady={!!systemStatus?.bedrock.credentialsFound}
            onNavigate={navigateToView}
          />
        )}
        {currentView.type === 'prompts' && <PromptsView />}
        {currentView.type === 'plugins' && <PluginManagementView />}
        {currentView.type === 'tools' && <ToolsView />}
        {(currentView.type === 'agent-new' || currentView.type === 'agent-edit') && (
          <AgentsView
            agents={agents}
            apiBase={API_BASE}
            availableModels={availableModels}
            defaultModel={appConfig?.defaultModel}
            bedrockReady={!!systemStatus?.bedrock.credentialsFound}
            onNavigate={navigateToView}
          />
        )}
        {(currentView.type === 'workspace-new' || currentView.type === 'workspace-edit') && (
          <WorkspacesView />
        )}
        {currentView.type === 'agent-tools' && (
          <ToolManagementView
            apiBase={API_BASE}
            agentSlug={currentView.slug}
            agentName={
              agents.find((a) => a.slug === currentView.slug)?.name ||
              currentView.slug
            }
            onBack={navigateToWorkspace}
          />
        )}
        {currentView.type === 'workflows' && (
          <WorkflowManagementView
            apiBase={API_BASE}
            agentSlug={currentView.slug}
            agentName={
              agents.find((a) => a.slug === currentView.slug)?.name ||
              currentView.slug
            }
            onBack={navigateToWorkspace}
          />
        )}
        {currentView.type === 'settings' && (
          <SettingsView
            onBack={navigateToWorkspace}
            onSaved={handleSettingsSaved}
            onNavigate={navigateToView}
          />
        )}
        {currentView.type === 'profile' && <ProfilePage />}
        {currentView.type === 'notifications' && <NotificationsPage />}
        {currentView.type === 'monitoring' && <MonitoringView />}
        {currentView.type === 'schedule' && <ScheduleView />}
      </>
    );
  };

  return (
    <div className="app">
      <Header
        workspaces={workspaces}
        selectedWorkspace={selectedWorkspaceData}
        currentView={currentView}
        onWorkspaceSelect={handleWorkspaceSelect}
        onCreateWorkspace={() => navigateToView({ type: 'workspace-new' })}
        onEditWorkspace={(slug) =>
          navigateToView({ type: 'workspace-edit', slug })
        }
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

      <ShortcutsCheatsheet
        isOpen={showShortcutsCheatsheet}
        onClose={() => setShowShortcutsCheatsheet(false)}
      />

      <div className="main-content">
        <div className="content-view">{renderViewContent()}</div>
      </div>

      <ChatDock onRequestAuth={handleAuthError} />
      <GlobalVoiceButton />
    </div>
  );
}

export default App;
