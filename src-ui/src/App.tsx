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
import { SettingsView } from './views/SettingsView';
import { ToolManagementView } from './views/ToolManagementView';
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

    if (path === '/agents') return { type: 'agents' };
    if (path === '/prompts') return { type: 'prompts' };
    if (path === '/plugins') return { type: 'plugins' };
    if (path === '/monitoring') return { type: 'monitoring' };
    if (path === '/schedule') return { type: 'schedule' };
    if (path === '/profile') return { type: 'profile' };
    if (path === '/notifications') return { type: 'notifications' };
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
      if (selectedWorkspace && selectedWorkspace !== 'new') {
        navigate(`/workspaces/${selectedWorkspace}`);
      } else {
        navigate('/');
      }
    } else if (view.type === 'workspaces') {
      navigate('/workspaces');
    } else if (view.type === 'agents') {
      navigate('/agents');
    } else if (view.type === 'prompts') {
      navigate('/prompts');
    } else if (view.type === 'plugins') {
      navigate('/plugins');
    } else if (view.type === 'profile') {
      navigate('/profile');
    } else if (view.type === 'notifications') {
      navigate('/notifications');
    } else if (view.type === 'settings') {
      navigate('/settings');
    } else if (view.type === 'monitoring') {
      navigate('/monitoring');
    } else if (view.type === 'schedule') {
      navigate('/schedule');
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
  }, [selectedWorkspace, navigate]);

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

      // Check path for main app navigation
      if (path === '/agents') {
        setCurrentView({ type: 'agents' });
        return;
      } else if (path === '/prompts') {
        setCurrentView({ type: 'prompts' });
        return;
      } else if (path === '/plugins') {
        setCurrentView({ type: 'plugins' });
        return;
      } else if (path === '/profile') {
        setCurrentView({ type: 'profile' });
        return;
      } else if (path === '/notifications') {
        setCurrentView({ type: 'notifications' });
        return;
      } else if (path === '/monitoring') {
        setCurrentView({ type: 'monitoring' });
        return;
      } else if (path === '/schedule') {
        setCurrentView({ type: 'schedule' });
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
      if (path === '/workspaces') {
        setCurrentView({ type: 'workspaces' });
        return;
      }
      if (path.startsWith('/workspaces/')) {
        const pathParts = path.split('/');
        const workspaceSlug = pathParts[2];
        const tabId = pathParts[3];

        // Skip if this is an edit path (already handled above)
        if (workspaceSlug === 'new' || path.endsWith('/edit')) {
          return;
        }

        if (workspaceSlug && workspaceSlug !== selectedWorkspace) {
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

  // Auto-select first workspace if none selected
  useEffect(() => {
    if (
      workspaces.length > 0 &&
      !selectedWorkspace &&
      !selectedAgent &&
      currentView.type === 'workspace'
    ) {
      setWorkspace(workspaces[0].slug);
    }
  }, [
    workspaces,
    selectedWorkspace,
    selectedAgent,
    currentView.type,
    setWorkspace,
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
        {currentView.type === 'workspaces' && (
          <div
            style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '24px',
              }}
            >
              <div>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
                  Workspaces
                </h1>
                <p
                  style={{
                    margin: '4px 0 0 0',
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Manage workspace configurations and layouts
                </p>
              </div>
              <button
                className="button button--primary"
                onClick={() => navigateToView({ type: 'workspace-new' })}
              >
                + New Workspace
              </button>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '16px',
              }}
            >
              {workspaces.map((workspace: any) => (
                <div
                  key={workspace.slug}
                  style={{
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '20px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onClick={() =>
                    navigateToView({
                      type: 'workspace-edit',
                      slug: workspace.slug,
                    })
                  }
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ fontSize: '32px' }}>
                      {workspace.icon || '📋'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3
                          style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}
                        >
                          {workspace.name}
                        </h3>
                        {workspace.plugin && (
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: 'var(--bg-tertiary)',
                              color: 'var(--text-secondary)',
                              fontWeight: 500,
                              border: '1px solid var(--color-border)',
                            }}
                          >
                            {workspace.plugin}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {workspace.description && (
                    <p
                      style={{
                        margin: '0 0 12px 0',
                        fontSize: '14px',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.5,
                      }}
                    >
                      {workspace.description}
                    </p>
                  )}
                  <div
                    style={{ fontSize: '12px', color: 'var(--text-secondary)' }}
                  >
                    {workspace.tabs?.length || 0} tabs
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentView.type === 'agents' && (
          <div
            style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '24px',
              }}
            >
              <div>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
                  Agents
                </h1>
                <p
                  style={{
                    margin: '4px 0 0 0',
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Manage AI agents with custom prompts, models, and tools
                </p>
              </div>
              <button
                className="button button--primary"
                onClick={() => navigateToView({ type: 'agent-new' })}
                disabled={!systemStatus?.bedrock.credentialsFound}
                title={
                  !systemStatus?.bedrock.credentialsFound
                    ? 'AWS Bedrock credentials required to create agents'
                    : undefined
                }
                style={
                  !systemStatus?.bedrock.credentialsFound
                    ? { opacity: 0.5, cursor: 'not-allowed' }
                    : undefined
                }
              >
                + New Agent
              </button>
            </div>

            {/* Bedrock onboarding card when credentials not found */}
            {systemStatus && !systemStatus.bedrock.credentialsFound && (
              <div
                style={{
                  padding: '20px',
                  marginBottom: '24px',
                  background: 'var(--bg-secondary, #1a1a1a)',
                  border: '1px solid var(--border-primary, #333)',
                  borderRadius: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <span style={{ fontSize: '24px' }}>🧠</span>
                  <div>
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 600,
                        marginBottom: '4px',
                      }}
                    >
                      Bedrock Setup Required
                    </div>
                    <p
                      style={{
                        margin: '0 0 12px',
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.5,
                      }}
                    >
                      Creating and managing custom agents requires AWS Bedrock
                      credentials. Configure your AWS credentials to get
                      started.
                    </p>
                    <button
                      className="button button--secondary"
                      onClick={() => navigateToView({ type: 'settings' })}
                      style={{ fontSize: '13px', padding: '6px 14px' }}
                    >
                      Open Settings →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {(() => {
              const workspaceAgents = agents.filter((a) =>
                (a.slug).includes(':'),
              );
              const standaloneAgents = agents.filter(
                (a) => !(a.slug).includes(':') && a.source !== 'acp',
              );
              const acpAgents = agents.filter((a) => a.source === 'acp');

              return (
                <>
                  <h2
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      marginBottom: '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Agents
                  </h2>
                  {standaloneAgents.length > 0 ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: '16px',
                        marginBottom: '32px',
                      }}
                    >
                      {standaloneAgents.map((agent) => (
                        <div
                          key={agent.slug}
                          style={{
                            background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '12px',
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            transition: 'all 0.2s ease',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor =
                              'var(--accent-primary)';
                            e.currentTarget.style.transform =
                              'translateY(-2px)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor =
                              'var(--color-border)';
                            e.currentTarget.style.transform = 'translateY(0)';
                          }}
                          onClick={() =>
                            navigateToView({
                              type: 'agent-edit',
                              slug: agent.slug,
                            })
                          }
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '12px',
                              flex: 1,
                            }}
                          >
                            <AgentIcon agent={agent} size={48} />
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontSize: '16px',
                                  fontWeight: 600,
                                  marginBottom: '4px',
                                }}
                              >
                                {agent.name}
                              </div>
                              <div
                                style={{
                                  fontSize: '13px',
                                  color: 'var(--text-secondary)',
                                  fontFamily: 'monospace',
                                }}
                              >
                                {agent.slug}
                              </div>
                            </div>
                          </div>
                          {agent.description && (
                            <div
                              style={{
                                fontSize: '14px',
                                color: 'var(--text-secondary)',
                                lineHeight: '1.5',
                              }}
                            >
                              {agent.description.length > 100
                                ? `${agent.description.substring(0, 100)}...`
                                : agent.description}
                            </div>
                          )}
                          <div
                            style={{
                              display: 'flex',
                              gap: '8px',
                              flexWrap: 'wrap',
                              marginTop: 'auto',
                            }}
                          >
                            {(() => {
                              const modelId =
                                agent.model || appConfig?.defaultModel;
                              if (!modelId) return null;

                              const isInherited = !agent.model;
                              const modelInfo = availableModels.find(
                                (m) => m.id === modelId,
                              );

                              let displayName = 'model';
                              if (modelInfo) {
                                displayName = modelInfo.name;
                              } else if (typeof modelId === 'string') {
                                const parts = modelId.split('.');
                                if (parts.length > 1) {
                                  const modelPart = parts[1].split('-')[0];
                                  displayName =
                                    modelPart.charAt(0).toUpperCase() +
                                    modelPart.slice(1);
                                }
                              }

                              return (
                                <div
                                  style={{
                                    fontSize: '12px',
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    background: 'var(--color-bg)',
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  {displayName}
                                  {isInherited && (
                                    <span
                                      style={{
                                        marginLeft: '4px',
                                        opacity: 0.7,
                                      }}
                                    >
                                      (default)
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '40px 20px',
                        textAlign: 'center',
                        background: 'var(--color-bg-secondary)',
                        border: '1px dashed var(--border-primary)',
                        borderRadius: '12px',
                        marginBottom: '32px',
                      }}
                    >
                      <div style={{ fontSize: '48px', marginBottom: '12px' }}>
                        🤖
                      </div>
                      <p
                        style={{
                          margin: '0 0 8px 0',
                          fontSize: '14px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        No standalone agents yet
                      </p>
                      <p
                        style={{
                          margin: '0 0 16px 0',
                          fontSize: '13px',
                          color: 'var(--text-muted)',
                        }}
                      >
                        Create an agent to get started with custom AI assistants
                      </p>
                      <button
                        className="button button--primary"
                        onClick={() => navigateToView({ type: 'agent-new' })}
                        style={{ fontSize: '13px', padding: '8px 16px' }}
                      >
                        + Create Agent
                      </button>
                    </div>
                  )}

                  {workspaceAgents.length > 0 && (
                    <>
                      <h2
                        style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                          marginBottom: '12px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        Workspace Agents
                      </h2>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fill, minmax(320px, 1fr))',
                          gap: '16px',
                        }}
                      >
                        {workspaceAgents.map((agent) => {
                          const owningWorkspace = (
                            agent.slug
                          ).split(':')[0];

                          return (
                            <div
                              key={agent.slug}
                              style={{
                                background: 'var(--color-bg-secondary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '12px',
                                padding: '20px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px',
                                transition: 'all 0.2s ease',
                                cursor: 'pointer',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor =
                                  'var(--accent-primary)';
                                e.currentTarget.style.transform =
                                  'translateY(-2px)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor =
                                  'var(--color-border)';
                                e.currentTarget.style.transform =
                                  'translateY(0)';
                              }}
                              onClick={() =>
                                navigateToView({
                                  type: 'agent-edit',
                                  slug: agent.slug,
                                })
                              }
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '12px',
                                  flex: 1,
                                }}
                              >
                                <AgentIcon agent={agent} size={48} />
                                <div style={{ flex: 1 }}>
                                  <div
                                    style={{
                                      fontSize: '16px',
                                      fontWeight: 600,
                                      marginBottom: '4px',
                                    }}
                                  >
                                    {agent.name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '13px',
                                      color: 'var(--text-secondary)',
                                      fontFamily: 'monospace',
                                    }}
                                  >
                                    {agent.slug}
                                  </div>
                                </div>
                              </div>
                              {agent.description && (
                                <div
                                  style={{
                                    fontSize: '14px',
                                    color: 'var(--text-secondary)',
                                    lineHeight: '1.5',
                                  }}
                                >
                                  {agent.description.length > 100
                                    ? `${agent.description.substring(0, 100)}...`
                                    : agent.description}
                                </div>
                              )}
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '8px',
                                  flexWrap: 'wrap',
                                  marginTop: 'auto',
                                  alignItems: 'center',
                                }}
                              >
                                {(() => {
                                  const modelId =
                                    agent.model || appConfig?.defaultModel;
                                  if (!modelId) return null;

                                  const isInherited = !agent.model;
                                  const modelInfo = availableModels.find(
                                    (m) => m.id === modelId,
                                  );

                                  let displayName = 'model';
                                  if (modelInfo) {
                                    displayName = modelInfo.name;
                                  } else if (typeof modelId === 'string') {
                                    const parts = modelId.split('.');
                                    if (parts.length > 1) {
                                      const modelPart = parts[1].split('-')[0];
                                      displayName =
                                        modelPart.charAt(0).toUpperCase() +
                                        modelPart.slice(1);
                                    }
                                  }

                                  return (
                                    <div
                                      style={{
                                        fontSize: '12px',
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        background: 'var(--color-bg)',
                                        color: 'var(--text-secondary)',
                                      }}
                                    >
                                      {displayName}
                                      {isInherited && (
                                        <span
                                          style={{
                                            marginLeft: '4px',
                                            opacity: 0.7,
                                          }}
                                        >
                                          (default)
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                                <div
                                  style={{
                                    marginLeft: 'auto',
                                    fontSize: '10px',
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    background: 'var(--accent-primary)',
                                    color: 'var(--bg-primary)',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                  }}
                                >
                                  {owningWorkspace}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* ACP Connections */}
                  <ACPConnectionsSection
                    acpAgents={acpAgents as unknown as AgentSummary[]}
                    apiBase={API_BASE}
                  />
                </>
              );
            })()}
          </div>
        )}
        {currentView.type === 'prompts' && (
          <div
            style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '24px',
              }}
            >
              <div>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
                  Global Prompts
                </h1>
                <p
                  style={{
                    margin: '4px 0 0 0',
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Create reusable prompts for workspaces and agent commands
                </p>
              </div>
            </div>
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
              <p>Prompts management coming soon.</p>
            </div>
          </div>
        )}
        {currentView.type === 'plugins' && <PluginManagementView />}
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
