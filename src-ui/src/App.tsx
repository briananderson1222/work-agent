import { useWorkspacesQuery, useProjectLayoutsQuery } from '@stallion-ai/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChatDock } from './components/ChatDock';
import { Header } from './components/Header';
import { ProjectSidebar } from './components/ProjectSidebar';
import { ShortcutsCheatsheet } from './components/ShortcutsCheatsheet';
import { useAgents } from './contexts/AgentsContext';
import { useApiBase } from './contexts/ApiBaseContext';
import { useConfig } from './contexts/ConfigContext';
import { useModels } from './contexts/ModelsContext';
import { useNavigation } from './contexts/NavigationContext';
import { ProjectsProvider } from './contexts/ProjectsContext';
import { useToast } from './contexts/ToastContext';
import { useWorkflows } from './contexts/WorkflowsContext';
import { useExternalAuth } from './hooks/useExternalAuth';
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut';
import { useServerEvents } from './hooks/useServerEvents';
import { useSystemStatus } from './hooks/useSystemStatus';
import { setAuthCallback } from './lib/apiClient';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import type { NavigationView, DockMode } from './types';
import { GlobalVoiceButton } from './components/GlobalVoiceButton';
import { setDockModeOverride } from './hooks/useDockModePreference';
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
import { WorkspaceView } from './views/WorkspaceView';
import { CodingLayout } from './components/CodingLayout';
import { NewProjectModal } from './components/NewProjectModal';
import { ProjectSettingsView } from './views/ProjectSettingsView';
import { ProviderSettingsView } from './views/ProviderSettingsView';

// Layout type registry — maps layout type strings to React components
type LayoutTypeComponent = React.ComponentType<{ projectSlug: string; layoutSlug: string; config: Record<string, unknown> }>;
const layoutTypeRegistry: Record<string, LayoutTypeComponent> = {
  coding: CodingLayout,
  // 'chat' type falls through to WorkspaceView (default)
};

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
    dockMode,
    setWorkspace,
    setWorkspaceTab,
    setDockMode,
    navigate,
  } = useNavigation();
  const { showToast } = useToast();
  const { data: workspaces = [] } = useWorkspacesQuery();
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
    if (path === '/manage/providers') return { type: 'providers' };
    if (path.startsWith('/manage/providers/')) {
      const id = path.split('/')[3];
      if (id) return { type: 'provider-edit', id };
    }
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
    if (path === '/providers') return { type: 'providers' };
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

    // Project routes
    if (path === '/projects/new') return { type: 'project-new' };
    if (path.startsWith('/projects/') && path.endsWith('/edit')) {
      const slug = path.split('/')[2];
      return { type: 'project-edit', slug };
    }
    if (path.match(/^\/projects\/[^/]+\/layouts\/[^/]+$/)) {
      const parts = path.split('/');
      return { type: 'layout', projectSlug: parts[2], layoutSlug: parts[4] };
    }
    if (path.startsWith('/projects/')) {
      const slug = path.split('/')[2];
      if (slug) return { type: 'project', slug };
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
    } else if (view.type === 'providers') {
      navigate('/manage/providers');
    } else if (view.type === 'provider-edit') {
      navigate(`/manage/providers/${view.id}`);
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
    } else if (view.type === 'project-new') {
      navigate('/projects/new');
    } else if (view.type === 'project-edit' && 'slug' in view) {
      navigate(`/projects/${view.slug}/edit`);
    } else if (view.type === 'project' && 'slug' in view) {
      navigate(`/projects/${view.slug}`);
    } else if (view.type === 'layout' && 'projectSlug' in view) {
      navigate(`/projects/${view.projectSlug}/layouts/${view.layoutSlug}`);
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
      if (path === '/manage/providers') { setCurrentView({ type: 'providers' }); return; }
      if (path.startsWith('/manage/providers/')) {
        const id = path.split('/')[3];
        if (id) { setCurrentView({ type: 'provider-edit', id }); return; }
      }
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
      if (path === '/providers') { setCurrentView({ type: 'providers' }); return; }
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

      // Project routes
      if (path === '/projects/new') { setCurrentView({ type: 'project-new' }); return; }
      if (path.startsWith('/projects/') && path.endsWith('/edit')) {
        const slug = path.split('/')[2];
        setCurrentView({ type: 'project-edit', slug }); return;
      }
      if (path.match(/^\/projects\/[^/]+\/layouts\/[^/]+$/)) {
        const parts = path.split('/');
        setCurrentView({ type: 'layout', projectSlug: parts[2], layoutSlug: parts[4] }); return;
      }
      if (path.startsWith('/projects/')) {
        const slug = path.split('/')[2];
        if (slug) { setCurrentView({ type: 'project', slug }); return; }
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

  // Determine current layout key for sessionStorage override
  const currentLayoutKey = currentView.type === 'layout' ? 'coding' : null;

  useKeyboardShortcut(
    'dock.cycleMode',
    'd',
    ['cmd', 'shift'],
    'Cycle dock mode',
    useCallback(() => {
      const modes: DockMode[] = ['bottom', 'right', 'bottom-inline'];
      const next = modes[(modes.indexOf(dockMode) + 1) % modes.length];
      setDockModeOverride(currentLayoutKey, next);
      setDockMode(next);
    }, [dockMode, setDockMode, currentLayoutKey]),
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
        {currentView.type === 'providers' && <ProviderSettingsView onNavigate={navigateToView} />}
        {currentView.type === 'provider-edit' && <ProviderSettingsView selectedProviderId={currentView.id} onNavigate={navigateToView} />}
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
        {currentView.type === 'project-new' && (
          <NewProjectModal isOpen onClose={() => {
            // Only go home if we're still on project-new (not if setProject already navigated)
            if (window.location.pathname === '/projects/new') navigateToWorkspace();
          }} />
        )}
        {currentView.type === 'project-edit' && (
          <ProjectSettingsView slug={currentView.slug} />
        )}
        {currentView.type === 'layout' && (
          <LayoutRenderer
            projectSlug={currentView.projectSlug}
            layoutSlug={currentView.layoutSlug}
          />
        )}
        {currentView.type === 'project' && (
          <ProjectOverview slug={currentView.slug} onNavigate={navigateToView} />
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
    <ProjectsProvider>
      <div className="app app--with-sidebar">
        <ProjectSidebar />
        <div className={`app__main${dockMode !== 'bottom' ? ` app__main--dock-${dockMode}` : ''}`}>
          <Header
            currentView={currentView}
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
      </div>
    </ProjectsProvider>
  );
}

export default App;

function LayoutRenderer({ projectSlug, layoutSlug }: { projectSlug: string; layoutSlug: string }) {
  const { apiBase: API_BASE } = useApiBase();
  const [layoutConfig, setLayoutConfig] = useState<{ type?: string; config?: Record<string, unknown> } | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/projects/${projectSlug}/layouts/${layoutSlug}`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setLayoutConfig(json.data); })
      .catch(() => {});
  }, [API_BASE, projectSlug, layoutSlug]);

  if (!layoutConfig) return <WorkspaceView projectSlug={projectSlug} layoutSlug={layoutSlug} />;

  const Renderer = layoutTypeRegistry[layoutConfig.type];
  if (Renderer) {
    return <Renderer projectSlug={projectSlug} layoutSlug={layoutSlug} config={layoutConfig.config ?? {}} />;
  }

  // Default: treat as chat layout
  return <WorkspaceView projectSlug={projectSlug} layoutSlug={layoutSlug} />;
}

function AddLayoutButton({ projectSlug, onAdded }: { projectSlug: string; onAdded: () => void }) {
  const { apiBase } = useApiBase();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<Array<{ source: string; plugin?: string; name: string; slug: string; icon?: string; description?: string; type: string; tabCount?: number }>>([]);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch(`${apiBase}/api/projects/layouts/available`).then(r => r.json()).then(d => {
      if (d.success) setAvailable(d.data ?? []);
    }).catch(() => {});
  }, [open, apiBase]);

  const addLayout = async (item: typeof available[0]) => {
    setAdding(item.slug);
    try {
      if (item.source === 'plugin' && item.plugin) {
        await fetch(`${apiBase}/api/projects/${projectSlug}/layouts/from-plugin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plugin: item.plugin }),
        });
      } else {
        await fetch(`${apiBase}/api/projects/${projectSlug}/layouts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: item.type, name: item.name, slug: `${item.slug}-${Date.now().toString(36)}`, icon: item.icon, config: {} }),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['projects', projectSlug, 'layouts'] });
      onAdded();
      setOpen(false);
    } catch { /* ignore */ }
    setAdding(null);
  };

  return (
    <>
      <button className="project-dashboard__edit-btn" onClick={() => setOpen(true)}>+ Add Layout</button>
      {open && (
        <div className="project-dashboard__modal-overlay" onClick={() => setOpen(false)}>
          <div className="project-dashboard__modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Add Layout</h3>
            <div className="project-dashboard__list">
              {available.map(item => (
                <button
                  key={`${item.source}-${item.slug}`}
                  className="project-dashboard__layout-btn"
                  disabled={adding === item.slug}
                  onClick={() => addLayout(item)}
                >
                  {item.icon && <span>{item.icon}</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{item.name}</div>
                    {item.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.description}</div>}
                  </div>
                  <span className="project-dashboard__badge">{item.source === 'plugin' ? `plugin: ${item.plugin}` : item.type}</span>
                </button>
              ))}
              {available.length === 0 && <p className="project-dashboard__empty">No layouts available. Install a plugin first.</p>}
            </div>
            <div style={{ marginTop: '16px', textAlign: 'right' }}>
              <button className="project-dashboard__edit-btn" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProjectOverview({
  slug,
  onNavigate,
}: {
  slug: string;
  onNavigate: (view: NavigationView) => void;
}) {
  const { apiBase: API_BASE } = useApiBase();
  const { data: layouts = [] } = useProjectLayoutsQuery(slug);
  const [project, setProject] = useState<any>(null);
  const [knowledge, setKnowledge] = useState<{ documentCount: number; totalChunks: number; lastIndexed: string | null } | null>(null);
  const [gitInfo, setGitInfo] = useState<Record<string, { branch: string; changes: string[] }>>({});
  const [agents, setAgents] = useState<Array<{ slug: string; name: string; icon?: string; source?: string }>>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/projects/${slug}`).then(r => r.json()).then(d => { if (d.success) setProject(d.data); });
    fetch(`${API_BASE}/api/projects/${slug}/knowledge/status`).then(r => r.json()).then(d => { if (d.success) setKnowledge(d.data); }).catch(() => {});
    fetch(`${API_BASE}/api/agents`).then(r => r.json()).then(d => { if (d.success ?? d.data) setAgents(d.data ?? []); }).catch(() => {});
  }, [API_BASE, slug]);

  // Fetch git info for each directory
  useEffect(() => {
    if (!project?.directories?.length) return;
    for (const dir of project.directories) {
      fetch(`${API_BASE}/api/coding/git/status?path=${encodeURIComponent(dir.path)}`)
        .then(r => r.json())
        .then(d => { if (d.success) setGitInfo(prev => ({ ...prev, [dir.path]: d.data })); })
        .catch(() => {});
    }
  }, [API_BASE, project]);

  if (!project) return <div className="project-dashboard">Loading…</div>;

  return (
    <div className="project-dashboard">
      <div className="project-dashboard__header">
        <h2 className="project-dashboard__title">
          {project.icon && <span>{project.icon} </span>}{project.name}
        </h2>
        <button className="project-dashboard__edit-btn" onClick={() => onNavigate({ type: 'project-edit', slug })}>
          ⚙ Settings
        </button>
      </div>
      {project.description && <p className="project-dashboard__desc">{project.description}</p>}

      <div className="project-dashboard__grid">
        {/* Directories */}
        <section className="project-dashboard__card">
          <h3 className="project-dashboard__card-title">📁 Directories</h3>
          {project.directories?.length > 0 ? (
            <div className="project-dashboard__list">
              {project.directories.map((dir: any) => {
                const git = gitInfo[dir.path];
                return (
                  <div key={dir.id} className="project-dashboard__dir">
                    <div className="project-dashboard__dir-path">{dir.label || dir.path.split('/').pop()}</div>
                    <div className="project-dashboard__dir-meta">
                      <span className="project-dashboard__badge">{dir.role}</span>
                      {git && <span className="project-dashboard__badge project-dashboard__badge--git">⎇ {git.branch}</span>}
                      {git && git.changes.length > 0 && <span className="project-dashboard__badge project-dashboard__badge--changes">{git.changes.length} changes</span>}
                    </div>
                    <div className="project-dashboard__dir-fullpath">{dir.path}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="project-dashboard__empty">No directories configured</p>
          )}
        </section>

        {/* Layouts */}
        <section className="project-dashboard__card">
          <div className="project-dashboard__list">
            {(layouts as any[]).map((layout: any) => (
              <button
                key={layout.slug}
                className="project-dashboard__layout-btn"
                onClick={() => onNavigate({ type: 'layout', projectSlug: slug, layoutSlug: layout.slug })}
              >
                {layout.icon && <span>{layout.icon}</span>}
                <span>{layout.name}</span>
                <span className="project-dashboard__badge">{layout.type}</span>
              </button>
            ))}
            {(layouts as any[]).length === 0 && (
              <p className="project-dashboard__empty">No layouts yet — add one in <button className="project-dashboard__link" onClick={() => onNavigate({ type: 'project-edit', slug })}>settings</button></p>
            )}
          </div>
        </section>

        {/* Knowledge */}
        <section className="project-dashboard__card">
          <h3 className="project-dashboard__card-title">📚 Knowledge</h3>
          {knowledge && knowledge.totalChunks > 0 ? (
            <div className="project-dashboard__list">
              <div className="project-dashboard__doc">
                <span>{knowledge.documentCount} documents</span>
                <span className="project-dashboard__badge">{knowledge.totalChunks} chunks</span>
              </div>
              {knowledge.lastIndexed && (
                <p className="project-dashboard__empty">Last indexed: {new Date(knowledge.lastIndexed).toLocaleDateString()}</p>
              )}
            </div>
          ) : (
            <p className="project-dashboard__empty">No documents — configure in <button className="project-dashboard__link" onClick={() => onNavigate({ type: 'project-edit', slug })}>settings</button></p>
          )}
        </section>

        {/* Agents */}
        <section className="project-dashboard__card">
          <h3 className="project-dashboard__card-title">🤖 Agents</h3>
          {agents.length > 0 ? (
            <div className="project-dashboard__list">
              {agents.map((agent) => {
                const isAcp = agent.source === 'acp';
                const primaryDir = project?.directories?.find((d: any) => d.role === 'primary');
                return (
                  <div key={agent.slug} className="project-dashboard__doc">
                    <span>{agent.icon ?? '🤖'} {agent.name}</span>
                    <div className="project-dashboard__agent-meta">
                      {isAcp && <span className="project-dashboard__badge project-dashboard__badge--git">ACP</span>}
                      {isAcp && primaryDir && <span className="project-dashboard__badge">cwd: {primaryDir.path.split('/').pop()}</span>}
                      {!isAcp && <span className="project-dashboard__badge">built-in</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="project-dashboard__empty">No agents configured</p>
          )}
        </section>
      </div>
    </div>
  );
}
