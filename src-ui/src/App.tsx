import {
  useLayoutsQuery,
  useProjectLayoutsQuery,
  useProjectsQuery,
} from '@stallion-ai/sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChatDock } from './components/ChatDock';
import { CodingLayout } from './components/CodingLayout';
import { Header } from './components/Header';
import { NewProjectModal } from './components/NewProjectModal';
import { ProjectSidebar } from './components/ProjectSidebar';
import { ShortcutsCheatsheet } from './components/ShortcutsCheatsheet';
import { VoicePill } from './components/VoicePill';
import { useAgents } from './contexts/AgentsContext';
import { useApiBase } from './contexts/ApiBaseContext';
import { useConfig } from './contexts/ConfigContext';
import { useModels } from './contexts/ModelsContext';
import { useNavigation } from './contexts/NavigationContext';
import { ProjectsProvider } from './contexts/ProjectsContext';
import { useToast } from './contexts/ToastContext';
import { useWorkflows } from './contexts/WorkflowsContext';
import { setDockModeOverride } from './hooks/useDockModePreference';
import { useExternalAuth } from './hooks/useExternalAuth';
import { useFeatureSettings } from './hooks/useFeatureSettings';
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut';
import { useServerEvents } from './hooks/useServerEvents';
import { useSystemStatus } from './hooks/useSystemStatus';
import { setAuthCallback } from './lib/apiClient';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import type { DockMode, NavigationView } from './types';
import { AgentsHub } from './views/AgentsHub';
import { AgentsView } from './views/AgentsView';
import { ConnectionsHub } from './views/ConnectionsHub';
import { IntegrationsView } from './views/IntegrationsView';
import { KnowledgeConnectionView } from './views/KnowledgeConnectionView';
import { LayoutsView } from './views/LayoutsView';
import { LayoutView } from './views/LayoutView';
import { MonitoringViewWithBoundary as MonitoringView } from './views/MonitoringView';
import { PluginManagementView } from './views/PluginManagementView';
import { ProjectPage } from './views/ProjectPage';
import { ProjectSettingsView } from './views/ProjectSettingsView';
import { PromptsView } from './views/PromptsView';
import { ProviderSettingsView } from './views/ProviderSettingsView';
import { RuntimeConnectionView } from './views/RuntimeConnectionView';
import { ScheduleView } from './views/ScheduleView';
import { SettingsView } from './views/SettingsView';
import { SkillsView } from './views/SkillsView';
import { ToolManagementView } from './views/ToolManagementView';
import { WorkflowManagementView } from './views/WorkflowManagementView';

// Layout type registry — maps layout type strings to React components
type LayoutTypeComponent = React.ComponentType<{
  projectSlug: string;
  layoutSlug: string;
  config: Record<string, unknown>;
}>;
const layoutTypeRegistry: Record<string, LayoutTypeComponent> = {
  coding: CodingLayout,
  // 'chat' type falls through to LayoutView (default)
};

function App() {
  const { apiBase: API_BASE } = useApiBase();
  const availableModels = useModels();
  const agents = useAgents();

  // SSE event stream — replaces all polling for ACP status, agent changes, etc.
  useServerEvents();
  const {
    selectedAgent,
    selectedLayout,
    lastLayout,
    lastProject,
    lastProjectLayout,
    dockMode,
    setStandaloneLayout,
    setLayoutTab,
    setLayout,
    setDockMode,
    navigate,
  } = useNavigation();
  const { showToast } = useToast();
  const { data: layouts = [] } = useLayoutsQuery();
  const { data: projects = [] } = useProjectsQuery();
  const [activeTabId, setActiveTabId] = useState<string>('');
  const appConfig = useConfig();
  const [globalError, _setGlobalError] = useState<string | null>(null);
  const [managementNotice, setManagementNotice] = useState<string | null>(null);
  useWorkflows(API_BASE);
  const { settings: featureSettings } = useFeatureSettings();
  const [showShortcutsCheatsheet, setShowShortcutsCheatsheet] = useState(false);
  useExternalAuth();
  const { data: systemStatus } = useSystemStatus();
  const [currentView, setCurrentView] = useState<NavigationView>(() => {
    const path = window.location.pathname;

    if (path === '/agents' || path.startsWith('/agents/')) {
      if (path === '/agents/new') return { type: 'agent-new' };
      if (path.endsWith('/edit')) {
        const slug = path.split('/')[2];
        return { type: 'agent-edit', slug };
      }
      if (path.endsWith('/tools')) {
        const slug = path.split('/')[2];
        return { type: 'agent-tools', slug };
      }
      if (path.endsWith('/workflows')) {
        const slug = path.split('/')[2];
        return { type: 'workflows', slug };
      }
      if (path !== '/agents') {
        const slug = path.split('/')[2];
        if (slug) return { type: 'agent-edit', slug };
      }
      return { type: 'agents' };
    }
    if (path === '/layouts' || path === '/layouts/new')
      return { type: 'layouts' };
    if (path.startsWith('/layouts/') && path.endsWith('/edit'))
      return { type: 'layouts' };
    if (path === '/prompts' || path.startsWith('/prompts/'))
      return { type: 'prompts' };
    if (path === '/skills' || path.startsWith('/skills/'))
      return { type: 'skills' };
    if (path === '/plugins' || path.startsWith('/plugins/'))
      return { type: 'plugins' };
    if (path === '/connections') return { type: 'connections' };
    if (path === '/connections/providers')
      return { type: 'connections-providers' };
    if (path.startsWith('/connections/providers/')) {
      const id = path.split('/')[3];
      if (id) return { type: 'connections-provider-edit', id };
    }
    if (path.startsWith('/connections/runtimes/')) {
      const id = path.split('/')[3];
      if (id) return { type: 'connections-runtime-edit', id };
    }
    if (path === '/connections/tools') return { type: 'connections-tools' };
    if (path.startsWith('/connections/tools/')) {
      const id = path.split('/')[3];
      if (id) return { type: 'connections-tool-edit', id };
    }
    if (path === '/connections/knowledge')
      return { type: 'connections-knowledge' };
    // Legacy redirects
    if (path === '/integrations' || path.startsWith('/integrations/'))
      return { type: 'connections-tools' };
    if (path === '/providers') return { type: 'connections-providers' };
    if (path.startsWith('/providers/')) {
      const id = path.split('/')[2];
      if (id) return { type: 'connections-provider-edit', id };
    }
    if (path === '/monitoring') return { type: 'monitoring' };
    if (path === '/schedule') return { type: 'schedule' };
    if (path === '/settings') return { type: 'settings' };
    if (path === '/profile') return { type: 'profile' };
    if (path === '/notifications') return { type: 'notifications' };
    // Legacy /manage/* redirects
    if (path === '/manage') return { type: 'agents' };
    if (path.startsWith('/manage/agents')) return { type: 'agents' };
    if (path.startsWith('/manage/prompts')) return { type: 'prompts' };
    if (path.startsWith('/manage/plugins')) return { type: 'plugins' };
    if (path.startsWith('/manage/integrations'))
      return { type: 'connections-tools' };
    if (path.startsWith('/manage/providers'))
      return { type: 'connections-providers' };
    // Legacy /tools redirect
    if (path === '/tools') return { type: 'connections-tools' };
    // Legacy /sys/* redirects
    if (path === '/sys/monitoring') return { type: 'monitoring' };
    if (path === '/sys/schedule') return { type: 'schedule' };

    // Project routes
    if (path === '/projects/new') return { type: 'project-new' };
    if (path.startsWith('/projects/') && path.endsWith('/edit')) {
      const slug = path.split('/')[2];
      return { type: 'project-edit', slug };
    }
    if (path.match(/^\/projects\/[^/]+\/layouts\/[^/]+/)) {
      const parts = path.split('/');
      return { type: 'layout', projectSlug: parts[2], layoutSlug: parts[4] };
    }
    if (path.startsWith('/projects/')) {
      const slug = path.split('/')[2];
      if (slug) return { type: 'project', slug };
    }

    return { type: 'standalone-layout' };
  });
  const handleLayoutSelect = useCallback(
    async (slug: string, preferredTabId?: string) => {
      const layout = layouts.find((w: any) => w.slug === slug);
      if (layout) {
        const tabs = layout.tabs || [];
        const validTabId =
          preferredTabId && tabs.find((t: any) => t.id === preferredTabId)
            ? preferredTabId
            : tabs[0]?.id || '';

        setStandaloneLayout(slug);
        setActiveTabId(validTabId);
        setLayoutTab(slug, validTabId);
        setCurrentView({ type: 'standalone-layout' });
        navigate(`/layouts/${slug}`);
      }
    },
    [layouts, setStandaloneLayout, setLayoutTab, navigate],
  );

  // Navigation functions (declared early so useEffect closures can reference them)
  const navigateToView = useCallback(
    (view: NavigationView) => {
      setCurrentView(view);

      // Update URL based on view type
      if (view.type === 'standalone-layout') {
        const target = selectedLayout || lastLayout;
        if (target && target !== 'new') {
          navigate(`/layouts/${target}`);
        } else {
          navigate('/');
        }
      } else if (view.type === 'layouts') {
        navigate('/layouts');
      } else if (view.type === 'agents') {
        navigate('/agents');
      } else if (view.type === 'prompts') {
        navigate('/prompts');
      } else if (view.type === 'skills') {
        navigate('/skills');
      } else if (view.type === 'plugins') {
        navigate('/plugins');
      } else if (view.type === 'connections') {
        navigate('/connections');
      } else if (view.type === 'connections-providers') {
        navigate('/connections/providers');
      } else if (view.type === 'connections-provider-edit') {
        navigate(`/connections/providers/${view.id}`);
      } else if (view.type === 'connections-runtime-edit') {
        navigate(`/connections/runtimes/${view.id}`);
      } else if (view.type === 'connections-tools') {
        navigate('/connections/tools');
      } else if (view.type === 'connections-tool-edit') {
        navigate(`/connections/tools/${view.id}`);
      } else if (view.type === 'connections-knowledge') {
        navigate('/connections/knowledge');
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
        navigate(`/agents/${view.slug}`);
      } else if (view.type === 'agent-detail' && 'slug' in view) {
        navigate(`/agents/${view.slug}`);
      } else if (view.type === 'agent-tools' && 'slug' in view) {
        navigate(`/agents/${view.slug}/tools`);
      } else if (view.type === 'workflows' && 'slug' in view) {
        navigate(`/agents/${view.slug}/workflows`);
      } else if (view.type === 'layout-new' || view.type === 'layout-edit') {
        navigate('/layouts');
      } else if (view.type === 'project-new') {
        navigate('/projects/new');
      } else if (view.type === 'project-edit' && 'slug' in view) {
        navigate(`/projects/${view.slug}/edit`);
      } else if (view.type === 'project' && 'slug' in view) {
        navigate(`/projects/${view.slug}`);
      } else if (view.type === 'layout' && 'projectSlug' in view) {
        setLayout(view.projectSlug!, view.layoutSlug!);
      }
    },
    [selectedLayout, lastLayout, navigate, setLayout],
  );

  const navigateToLayout = useCallback(() => {
    setCurrentView({ type: 'standalone-layout' });
    if (selectedLayout) {
      navigate(`/layouts/${selectedLayout}`);
    } else {
      navigate('/');
    }
  }, [selectedLayout, navigate]);

  // Listen for path changes (back/forward navigation)
  useEffect(() => {
    const handlePathChange = () => {
      const path = window.location.pathname;

      // Primary routes
      if (path === '/agents' || path.startsWith('/agents/')) {
        if (path === '/agents/new') {
          setCurrentView({ type: 'agent-new' });
          return;
        }
        if (path.startsWith('/agents/') && path.endsWith('/edit')) {
          const slug = path.split('/')[2];
          setCurrentView({ type: 'agent-edit', slug });
          return;
        }
        if (path.startsWith('/agents/') && path.endsWith('/tools')) {
          const slug = path.split('/')[2];
          setCurrentView({ type: 'agent-tools', slug });
          return;
        }
        if (path.startsWith('/agents/') && path.endsWith('/workflows')) {
          const slug = path.split('/')[2];
          setCurrentView({ type: 'workflows', slug });
          return;
        }
        if (path !== '/agents') {
          const slug = path.split('/')[2];
          if (slug) {
            setCurrentView({ type: 'agent-edit', slug });
            return;
          }
        }
        setCurrentView({ type: 'agents' });
        return;
      }
      if (
        path === '/layouts' ||
        path === '/layouts/new' ||
        (path.startsWith('/layouts/') && path.endsWith('/edit'))
      ) {
        setCurrentView({ type: 'layouts' });
        return;
      }
      if (path === '/prompts' || path.startsWith('/prompts/')) {
        setCurrentView({ type: 'prompts' });
        return;
      }
      if (path === '/skills' || path.startsWith('/skills/')) {
        setCurrentView({ type: 'skills' });
        return;
      }
      if (path === '/plugins' || path.startsWith('/plugins/')) {
        setCurrentView({ type: 'plugins' });
        return;
      }
      if (path === '/connections') {
        setCurrentView({ type: 'connections' });
        return;
      }
      if (path === '/connections/providers') {
        setCurrentView({ type: 'connections-providers' });
        return;
      }
      if (path.startsWith('/connections/providers/')) {
        const id = path.split('/')[3];
        if (id) {
          setCurrentView({ type: 'connections-provider-edit', id });
          return;
        }
      }
      if (path.startsWith('/connections/runtimes/')) {
        const id = path.split('/')[3];
        if (id) {
          setCurrentView({ type: 'connections-runtime-edit', id });
          return;
        }
      }
      if (path === '/connections/tools') {
        setCurrentView({ type: 'connections-tools' });
        return;
      }
      if (path.startsWith('/connections/tools/')) {
        const id = path.split('/')[3];
        if (id) {
          setCurrentView({ type: 'connections-tool-edit', id });
          return;
        }
      }
      if (path === '/connections/knowledge') {
        setCurrentView({ type: 'connections-knowledge' });
        return;
      }
      // Legacy redirects
      if (path === '/integrations' || path.startsWith('/integrations/')) {
        setCurrentView({ type: 'connections-tools' });
        return;
      }
      if (path === '/providers') {
        setCurrentView({ type: 'connections-providers' });
        return;
      }
      if (path.startsWith('/providers/')) {
        const id = path.split('/')[2];
        if (id) {
          setCurrentView({ type: 'connections-provider-edit', id });
          return;
        }
      }
      if (path === '/monitoring') {
        setCurrentView({ type: 'monitoring' });
        return;
      }
      if (path === '/schedule') {
        setCurrentView({ type: 'schedule' });
        return;
      }
      if (path === '/settings') {
        setCurrentView({ type: 'settings' });
        return;
      }
      if (path === '/profile') {
        setCurrentView({ type: 'profile' });
        return;
      }
      if (path === '/notifications') {
        setCurrentView({ type: 'notifications' });
        return;
      }

      // Legacy /manage/* paths
      if (path === '/manage') {
        setCurrentView({ type: 'agents' });
        return;
      }
      if (path.startsWith('/manage/')) {
        setCurrentView({ type: 'agents' });
        return;
      }
      // Legacy /tools path
      if (path === '/tools') {
        setCurrentView({ type: 'connections-tools' });
        return;
      }
      // Legacy /sys/* paths
      if (path.startsWith('/sys/')) {
        if (path === '/sys/monitoring') {
          setCurrentView({ type: 'monitoring' });
          return;
        }
        if (path === '/sys/schedule') {
          setCurrentView({ type: 'schedule' });
          return;
        }
      }

      // Project routes
      if (path === '/projects/new') {
        setCurrentView({ type: 'project-new' });
        return;
      }
      if (path.startsWith('/projects/') && path.endsWith('/edit')) {
        const slug = path.split('/')[2];
        setCurrentView({ type: 'project-edit', slug });
        return;
      }
      if (path.match(/^\/projects\/[^/]+\/layouts\/[^/]+/)) {
        const parts = path.split('/');
        setCurrentView({
          type: 'layout',
          projectSlug: parts[2],
          layoutSlug: parts[4],
        });
        return;
      }
      if (path.startsWith('/projects/')) {
        const slug = path.split('/')[2];
        if (slug) {
          setCurrentView({ type: 'project', slug });
          return;
        }
      }

      // Standalone layout paths
      if (path === '/layouts') {
        setCurrentView({ type: 'layouts' });
        return;
      }
      if (path.startsWith('/layouts/')) {
        const pathParts = path.split('/');
        const layoutSlug = pathParts[2];
        const tabId = pathParts[3];

        if (layoutSlug === 'new' || path.endsWith('/edit')) return;

        if (layoutSlug && layoutSlug !== selectedLayout) {
          handleLayoutSelect(layoutSlug, tabId);
        } else if (tabId && tabId !== activeTabId) {
          setActiveTabId(tabId);
        }
        setCurrentView({ type: 'standalone-layout' });
        return;
      }

      setCurrentView({ type: 'standalone-layout' });
    };

    handlePathChange(); // Initial call
    window.addEventListener('popstate', handlePathChange);
    return () => {
      window.removeEventListener('popstate', handlePathChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, handleLayoutSelect, selectedLayout]);

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
          navigateToLayout();
        } else {
          navigateToView({ type: 'settings' });
        }
      }
      // Cmd/Ctrl + N: New layout
      else if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        navigateToView({ type: 'layout-new' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, navigateToView, navigateToLayout]);

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

  // Determine first project for default routing
  const firstProjectSlug = projects[0]?.slug || '';
  const { data: firstProjectLayouts = [] } = useProjectLayoutsQuery(
    firstProjectSlug,
    {
      enabled: !!firstProjectSlug,
    },
  );

  // Auto-select layout if none selected — prefer last-used, fall back to first
  useEffect(() => {
    if (
      currentView.type !== 'standalone-layout' ||
      selectedLayout ||
      selectedAgent
    )
      return;

    // 1. Restore last-viewed project+layout if it still exists
    if (
      lastProject &&
      lastProjectLayout &&
      projects.some((p: any) => p.slug === lastProject)
    ) {
      setCurrentView({
        type: 'layout',
        projectSlug: lastProject,
        layoutSlug: lastProjectLayout,
      });
      setLayout(lastProject, lastProjectLayout);
      return;
    }

    // 2. If projects exist with layouts, default to first project's first layout
    if (firstProjectSlug && firstProjectLayouts.length > 0 && !lastProject) {
      setCurrentView({
        type: 'layout',
        projectSlug: firstProjectSlug,
        layoutSlug: firstProjectLayouts[0].slug,
      });
      setLayout(firstProjectSlug, firstProjectLayouts[0].slug);
      return;
    }

    // 3. Fall back to standalone layout
    if (layouts.length > 0) {
      const target =
        lastLayout && layouts.find((w: any) => w.slug === lastLayout)
          ? lastLayout
          : layouts[0].slug;
      setStandaloneLayout(target);
    }
  }, [
    layouts,
    projects,
    firstProjectSlug,
    firstProjectLayouts,
    selectedLayout,
    selectedAgent,
    currentView.type,
    setStandaloneLayout,
    setLayout,
    lastLayout,
    lastProject,
    lastProjectLayout,
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
        navigateToLayout();
      } else {
        navigateToView({ type: 'settings' });
      }
    }, [currentView.type, navigateToLayout, navigateToView]),
  );

  useKeyboardShortcut(
    'app.newLayout',
    'n',
    ['cmd'],
    'New layout',
    useCallback(() => {
      navigateToView({ type: 'layout-new' });
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
    if (currentView.type === 'standalone-layout') {
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
          <LayoutView />
        </>
      );
    }

    // Management views
    return (
      <>
        {currentView.type === 'layouts' && <LayoutsView />}

        {currentView.type === 'agents' && (
          <AgentsHub onNavigate={navigateToView} />
        )}
        {(currentView.type === 'agent-detail' ||
          currentView.type === 'agent-new' ||
          currentView.type === 'agent-edit') && (
          <AgentsView
            agents={agents}
            apiBase={API_BASE}
            availableModels={availableModels}
            defaultModel={appConfig?.defaultModel}
            bedrockReady={!!systemStatus?.bedrock.credentialsFound}
            onNavigate={navigateToView}
          />
        )}
        {currentView.type === 'skills' && <SkillsView />}
        {currentView.type === 'prompts' && <PromptsView />}
        {currentView.type === 'plugins' && <PluginManagementView />}
        {currentView.type === 'connections' && <ConnectionsHub />}
        {currentView.type === 'connections-providers' && (
          <ProviderSettingsView onNavigate={navigateToView} />
        )}
        {currentView.type === 'connections-provider-edit' && (
          <ProviderSettingsView
            selectedProviderId={currentView.id}
            onNavigate={navigateToView}
          />
        )}
        {currentView.type === 'connections-runtime-edit' && (
          <RuntimeConnectionView
            selectedRuntimeId={currentView.id}
            onNavigate={navigateToView}
          />
        )}
        {(currentView.type === 'connections-tools' ||
          currentView.type === 'connections-tool-edit') && <IntegrationsView />}
        {currentView.type === 'connections-knowledge' && (
          <KnowledgeConnectionView />
        )}
        {(currentView.type === 'layout-new' ||
          currentView.type === 'layout-edit') && <LayoutsView />}
        {currentView.type === 'project-new' && (
          <NewProjectModal
            isOpen
            onClose={() => {
              // Only go home if we're still on project-new (not if setProject already navigated)
              if (window.location.pathname === '/projects/new')
                navigateToLayout();
            }}
          />
        )}
        {currentView.type === 'project-edit' && (
          <ProjectSettingsView slug={currentView.slug} />
        )}
        {currentView.type === 'layout' && (
          <ProjectLayoutRenderer
            projectSlug={currentView.projectSlug}
            layoutSlug={currentView.layoutSlug}
          />
        )}
        {currentView.type === 'project' && (
          <ProjectPage slug={currentView.slug} />
        )}
        {currentView.type === 'agent-tools' && (
          <ToolManagementView
            apiBase={API_BASE}
            agentSlug={currentView.slug}
            agentName={
              agents.find((a) => a.slug === currentView.slug)?.name ||
              currentView.slug
            }
            onBack={navigateToLayout}
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
            onBack={navigateToLayout}
          />
        )}
        {currentView.type === 'settings' && (
          <SettingsView
            onBack={navigateToLayout}
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
        <div
          className={`app__main${dockMode !== 'bottom' ? ` app__main--dock-${dockMode}` : ''}`}
        >
          <Header
            currentView={currentView}
            onNavigate={navigateToView}
            onToggleSettings={() => {
              if (currentView.type === 'settings') {
                navigateToLayout();
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
          {featureSettings.voiceS2SEnabled && <VoicePill />}
        </div>
      </div>
    </ProjectsProvider>
  );
}

export default App;

function ProjectLayoutRenderer({
  projectSlug,
  layoutSlug,
}: {
  projectSlug: string;
  layoutSlug: string;
}) {
  const { apiBase: API_BASE } = useApiBase();
  const [layoutConfig, setLayoutConfig] = useState<{
    type?: string;
    config?: Record<string, unknown>;
  } | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/projects/${projectSlug}/layouts/${layoutSlug}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setLayoutConfig(json.data);
      })
      .catch(() => {});
  }, [API_BASE, projectSlug, layoutSlug]);

  if (!layoutConfig)
    return <LayoutView projectSlug={projectSlug} layoutSlug={layoutSlug} />;

  const Renderer = layoutConfig.type
    ? layoutTypeRegistry[layoutConfig.type]
    : undefined;
  if (Renderer) {
    return (
      <Renderer
        projectSlug={projectSlug}
        layoutSlug={layoutSlug}
        config={layoutConfig.config ?? {}}
      />
    );
  }

  // Default: treat as chat layout
  return <LayoutView projectSlug={projectSlug} layoutSlug={layoutSlug} />;
}
