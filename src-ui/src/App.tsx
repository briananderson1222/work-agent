import { useProjectLayoutsQuery, useProjectsQuery } from '@stallion-ai/sdk';
import { useCallback, useEffect, useState } from 'react';
import { AppViewContent } from './app-shell/AppViewContent';
import { getPathForView, resolveViewFromPath } from './app-shell/routing';
import { ChatDock } from './components/ChatDock';
import { Header } from './components/Header';
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
import { setDockModeOverride } from './hooks/useDockModePreference';
import { useExternalAuth } from './hooks/useExternalAuth';
import { useFeatureSettings } from './hooks/useFeatureSettings';
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut';
import { useServerEvents } from './hooks/useServerEvents';
import { useSystemStatus } from './hooks/useSystemStatus';
import { setAuthCallback } from './lib/apiClient';
import type { DockMode, NavigationView } from './types';

function App() {
  const { apiBase: API_BASE } = useApiBase();
  const availableModels = useModels();
  const agents = useAgents();

  // SSE event stream — replaces all polling for ACP status, agent changes, etc.
  useServerEvents();
  const {
    lastProject,
    lastProjectLayout,
    dockMode,
    setLayout,
    setDockMode,
    navigate,
  } = useNavigation();
  const { showToast } = useToast();
  const { data: projects = [], isLoading: projectsLoading } =
    useProjectsQuery();
  const appConfig = useConfig();
  const [globalError, _setGlobalError] = useState<string | null>(null);
  const { settings: featureSettings } = useFeatureSettings();
  const [showShortcutsCheatsheet, setShowShortcutsCheatsheet] = useState(false);
  useExternalAuth();
  const { data: systemStatus } = useSystemStatus();
  const [currentView, setCurrentView] = useState<NavigationView>(() => {
    return resolveViewFromPath(window.location.pathname, {
      lastProject,
      lastProjectLayout,
    });
  });

  // Navigation functions (declared early so useEffect closures can reference them)
  const navigateToView = useCallback(
    (view: NavigationView) => {
      setCurrentView(view);
      if (view.type === 'layout') {
        setLayout(view.projectSlug, view.layoutSlug);
        return;
      }
      const path = getPathForView(view);
      if (path) {
        navigate(path);
      }
    },
    [navigate, setLayout],
  );

  const navigateHome = useCallback(() => {
    if (lastProject && lastProjectLayout) {
      setCurrentView({
        type: 'layout',
        projectSlug: lastProject,
        layoutSlug: lastProjectLayout,
      });
    } else if (lastProject) {
      setCurrentView({ type: 'project', slug: lastProject });
    } else {
      setCurrentView({ type: 'project-new' });
    }
    navigate('/');
  }, [lastProject, lastProjectLayout, navigate]);

  // Listen for path changes (back/forward navigation)
  useEffect(() => {
    const handlePathChange = () => {
      setCurrentView(
        resolveViewFromPath(window.location.pathname, {
          lastProject,
          lastProjectLayout,
        }),
      );
    };

    handlePathChange(); // Initial call
    window.addEventListener('popstate', handlePathChange);
    return () => {
      window.removeEventListener('popstate', handlePathChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastProject, lastProjectLayout]);

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
          navigateHome();
        } else {
          navigateToView({ type: 'settings' });
        }
      }
      // Cmd/Ctrl + N: New project
      else if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        navigateToView({ type: 'project-new' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, navigateToView, navigateHome]);

  // Mark sessions as read - handled by ChatDock

  // Drag handling - handled by ChatDock

  // Determine first project for default routing
  const firstProjectSlug = projects[0]?.slug || '';
  const {
    data: firstProjectLayouts = [],
    isLoading: firstProjectLayoutsLoading,
  } = useProjectLayoutsQuery(firstProjectSlug, {
    enabled: !!firstProjectSlug,
  });

  // Resolve the home route to a project layout or project creation.
  useEffect(() => {
    if (window.location.pathname !== '/') {
      return;
    }
    if (projectsLoading || (firstProjectSlug && firstProjectLayoutsLoading)) {
      return;
    }

    if (
      lastProject &&
      lastProjectLayout &&
      projects.some((p: any) => p.slug === lastProject)
    ) {
      setLayout(lastProject, lastProjectLayout);
      return;
    }

    if (firstProjectSlug && firstProjectLayouts.length > 0) {
      setLayout(firstProjectSlug, firstProjectLayouts[0].slug);
      return;
    }

    if (firstProjectSlug) {
      navigate(`/projects/${firstProjectSlug}`);
      return;
    }

    navigate('/projects/new');
  }, [
    projects,
    projectsLoading,
    firstProjectSlug,
    firstProjectLayouts,
    firstProjectLayoutsLoading,
    setLayout,
    lastProject,
    lastProjectLayout,
    navigate,
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
        navigateHome();
      } else {
        navigateToView({ type: 'settings' });
      }
    }, [currentView.type, navigateHome, navigateToView]),
  );

  useKeyboardShortcut(
    'app.newLayout',
    'n',
    ['cmd'],
    'New project',
    useCallback(() => {
      navigateToView({ type: 'project-new' });
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
                navigateHome();
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
            <div className="content-view">
              <AppViewContent
                currentView={currentView}
                agents={agents}
                apiBase={API_BASE}
                availableModels={availableModels}
                defaultModel={appConfig?.defaultModel}
                bedrockReady={!!systemStatus?.bedrock.credentialsFound}
                onNavigate={navigateToView}
                onNavigateHome={navigateHome}
                onSettingsSaved={handleSettingsSaved}
              />
            </div>
          </div>

          <ChatDock onRequestAuth={handleAuthError} />
          {featureSettings.voiceS2SEnabled && <VoicePill />}
        </div>
      </div>
    </ProjectsProvider>
  );
}

export default App;
