import {
  FullScreenError,
  FullScreenLoader,
  LayoutNavigationProvider,
  useLayoutQuery,
  useLayoutsQuery,
} from '@stallion-ai/sdk';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import {
  useCreateChatSession,
  useSendMessage,
} from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { SDKAdapter } from '../core/SDKAdapter';
import { useBranding } from '../hooks/useBranding';
import { useSlashCommandHandler } from '../hooks/useSlashCommandHandler';
import { LayoutRenderer } from '../layouts';

function useBackendReady(apiBase: string) {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`${apiBase}/layouts`, {
        signal: AbortSignal.timeout(3000),
      });
      setReady(res.ok);
    } catch {
      setReady(false);
    } finally {
      setChecking(false);
    }
  }, [apiBase]);

  useEffect(() => {
    check();
  }, [check]);

  return { ready, checking, retry: check };
}

export function LayoutView({
  projectSlug,
  layoutSlug,
}: {
  projectSlug?: string;
  layoutSlug?: string;
} = {}) {
  const { apiBase } = useApiBase();
  const {
    selectedLayout,
    activeTab,
    setDockState,
    setStandaloneLayout,
    setLayoutTab,
    setActiveChat,
    navigate,
  } = useNavigation();

  const agents = useAgents();
  const {
    ready: backendReady,
    checking: backendChecking,
    retry: retryBackend,
  } = useBackendReady(apiBase);

  const isProjectMode = !!(projectSlug && layoutSlug);

  // Project/layout path: fetch layout config and map to workspace shape
  const {
    data: layoutData,
    isLoading: layoutLoading,
    isError: layoutError,
    refetch: refetchLayout,
  } = useQuery({
    queryKey: ['projects', projectSlug, 'layouts', layoutSlug],
    queryFn: async () => {
      const res = await fetch(
        `${apiBase}/api/projects/${projectSlug}/layouts/${layoutSlug}`,
      );
      if (!res.ok) throw new Error('Failed to load layout');
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: isProjectMode,
  });

  // Map LayoutConfig → workspace shape
  const projectLayout = layoutData
    ? {
        slug: layoutData.slug,
        name: layoutData.name,
        icon: layoutData.icon,
        description: layoutData.description,
        tabs: (layoutData.config?.tabs ?? []).map((t: any) => ({
          id: t.id,
          label: t.label,
          component: t.component,
          icon: t.icon,
          description: t.description,
          actions: t.actions,
          prompts: t.prompts,
        })),
        globalPrompts: layoutData.config?.globalPrompts ?? [],
        actions: layoutData.config?.actions,
        defaultAgent: layoutData.config?.defaultAgent,
        availableAgents: layoutData.config?.availableAgents,
      }
    : null;

  // React Query auto-fetches, caches, dedupes
  const {
    data: standaloneLayoutData,
    isLoading,
    isError,
    refetch,
  } = useLayoutQuery(selectedLayout || '', {
    enabled: !isProjectMode && !!selectedLayout && backendReady,
  });

  const layout = isProjectMode ? projectLayout : standaloneLayoutData;
  const effectiveLoading = isProjectMode ? layoutLoading : isLoading;
  const effectiveError = isProjectMode ? layoutError : isError;
  const effectiveRefetch = isProjectMode ? refetchLayout : refetch;

  const createChatSession = useCreateChatSession();
  const slashCommandHandler = useSlashCommandHandler();

  // Set active tab via NavigationContext
  const setActiveTabId = useCallback(
    (tabId: string) => {
      if (selectedLayout) {
        setLayoutTab(selectedLayout, tabId);
      }
    },
    [selectedLayout, setLayoutTab],
  );

  // Auto-select first tab if none is active
  const activeTabId = activeTab || layout?.tabs?.[0]?.id || '';

  const [refreshKey, setRefreshKey] = useState(0);
  const queryClient = useQueryClient();
  const isFetching = useIsFetching();

  // Wrap slash command handler to match useSendMessage signature
  const handleSlashCommand = useCallback(
    async (sessionId: string, content: string) => {
      return await slashCommandHandler(sessionId, content, {
        autocomplete: {
          openModel: () => {},
          closeCommand: () => {},
          closeAll: () => {},
        },
      });
    },
    [slashCommandHandler],
  );

  const sendMessage = useSendMessage(
    apiBase,
    undefined,
    undefined,
    handleSlashCommand,
  );

  const activeTabObject = layout?.tabs?.find((t: any) => t.id === activeTabId);
  const agent = agents.find((a) => a.slug === layout?.defaultAgent);

  const handleLaunchPrompt = useCallback(
    async (prompt: any) => {
      const targetAgent = agents.find(
        (a) => a.slug === (prompt.agent || layout?.defaultAgent),
      );
      if (!targetAgent) return;

      const sessionId = createChatSession(
        targetAgent.slug,
        targetAgent.name,
        prompt.label,
        projectSlug ?? undefined,
      );
      setDockState(true);
      setActiveChat(sessionId);

      await sendMessage(sessionId, targetAgent.slug, undefined, prompt.prompt);
    },
    [
      agents,
      layout?.defaultAgent,
      createChatSession,
      sendMessage,
      setDockState,
      setActiveChat,
      projectSlug,
    ],
  );

  const handleRefresh = useCallback(() => {
    // Clear layout-scoped sessionStorage (context state + tab navigation hashes)
    const slug = isProjectMode ? layoutSlug : selectedLayout;
    const prefixes = [`layout:${slug}`, `layout-${slug}-tab-`];
    if (isProjectMode && projectSlug) {
      prefixes.push(`layout:${projectSlug}:${slug}`);
    }

    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && prefixes.some((p) => key.startsWith(p))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => sessionStorage.removeItem(key));

    // Invalidate all active React Query caches — only mounted queries refetch
    queryClient.invalidateQueries();

    setRefreshKey((prev) => prev + 1);
  }, [isProjectMode, projectSlug, layoutSlug, selectedLayout, queryClient]);

  const { data: allLayouts = [] } = useLayoutsQuery();

  if (!selectedLayout && !isProjectMode) {
    if (allLayouts.length === 0) {
      return <EmptyLayoutOnboarding />;
    }
    setStandaloneLayout(allLayouts[0].slug);
    return <FullScreenLoader label="layout" />;
  }

  // Selected layout doesn't exist — redirect to first available or root
  if (
    !isProjectMode &&
    allLayouts.length > 0 &&
    !allLayouts.some((w: any) => w.slug === selectedLayout)
  ) {
    setStandaloneLayout(allLayouts[0].slug);
    return <FullScreenLoader label="layout" />;
  }

  // Backend unreachable (skip in project mode — layout query handles its own errors)
  if (!isProjectMode && !backendChecking && !backendReady) {
    return (
      <FullScreenError
        title="Unable to connect"
        description={`The server at <code>${apiBase}</code> is not responding`}
        onRetry={retryBackend}
        retryLabel="Retry Connection"
      />
    );
  }

  // Project layout failed — layout doesn't exist, redirect to project page
  if (isProjectMode && effectiveError && !effectiveLoading) {
    try {
      localStorage.removeItem('lastProjectLayout');
    } catch {}
    navigate(`/projects/${projectSlug}`);
    return <FullScreenLoader label="layout" />;
  }

  // Query failed after backend was reachable — if layout doesn't exist, show onboarding
  if (effectiveError && !effectiveLoading) {
    if (!isProjectMode) {
      const layoutExists = allLayouts.some(
        (w: any) => w.slug === selectedLayout,
      );
      if (!layoutExists) {
        return <EmptyLayoutOnboarding />;
      }
    }
    return (
      <FullScreenError
        title="Failed to load layout"
        description="Something went wrong loading this layout. It might be a temporary issue."
        onRetry={() => effectiveRefetch()}
      />
    );
  }

  if (effectiveLoading || (!isProjectMode && backendChecking) || !layout) {
    return <FullScreenLoader label="layout" />;
  }

  return (
    <SDKAdapter layout={layout}>
      <LayoutNavigationProvider
        activeTabId={activeTabId}
        layoutSlug={layout?.slug}
      >
        <LayoutRenderer
          layout={layout}
          activeTab={activeTabObject}
          activeTabId={activeTabId}
          onTabChange={setActiveTabId}
          agent={agent as any}
          componentId={activeTabObject?.component}
          onLaunchPrompt={handleLaunchPrompt}
          onShowChat={() => setDockState(true)}
          refreshKey={refreshKey}
          onRefresh={handleRefresh}
          loading={isFetching > 0}
        />
      </LayoutNavigationProvider>
    </SDKAdapter>
  );
}

function EmptyLayoutOnboarding() {
  const { navigate } = useNavigation();
  const { appName, welcomeMessage } = useBranding();

  return (
    <div className="workspace-onboarding">
      <div className="workspace-onboarding__inner">
        <img src="/favicon.png" alt="" className="workspace-onboarding__icon" />
        <h2 className="workspace-onboarding__title">
          {welcomeMessage || `Welcome to ${appName}`}
        </h2>
        <p className="workspace-onboarding__desc">
          Projects give you a workspace with layouts, agents, and tools. Get
          started by creating one or installing a plugin.
        </p>
        <div className="workspace-onboarding__actions">
          <button
            className="workspace-onboarding__card"
            onClick={() => navigate('/layouts')}
          >
            <span className="workspace-onboarding__card-icon">✨</span>
            <div>
              <div className="workspace-onboarding__card-title">
                Create a Project
              </div>
              <div className="workspace-onboarding__card-desc">
                Set up a project with custom layouts, knowledge base, and agents
              </div>
            </div>
          </button>
          <button
            className="workspace-onboarding__card"
            onClick={() => navigate('/plugins')}
          >
            <span className="workspace-onboarding__card-icon">🧩</span>
            <div>
              <div className="workspace-onboarding__card-title">
                Install a Plugin
              </div>
              <div className="workspace-onboarding__card-desc">
                Add a pre-built layout from a git repo or local path
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
