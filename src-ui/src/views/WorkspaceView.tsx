import { useQueryClient } from '@tanstack/react-query';
import {
  FullScreenError,
  FullScreenLoader,
  useWorkspaceQuery,
  useWorkspacesQuery,
  WorkspaceNavigationProvider,
} from '@stallion-ai/sdk';
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
import { WorkspaceRenderer } from '../workspaces';

function useBackendReady(apiBase: string) {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`${apiBase}/workspaces`, {
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

export function WorkspaceView() {
  const { apiBase } = useApiBase();
  const {
    selectedWorkspace,
    activeTab,
    setDockState,
    setWorkspace,
    setWorkspaceTab,
    setActiveChat,
  } = useNavigation();

  const agents = useAgents();
  const {
    ready: backendReady,
    checking: backendChecking,
    retry: retryBackend,
  } = useBackendReady(apiBase);

  // React Query auto-fetches, caches, dedupes
  const {
    data: workspace,
    isLoading,
    isError,
    refetch,
  } = useWorkspaceQuery(selectedWorkspace || '', {
    enabled: !!selectedWorkspace && backendReady,
  });

  const createChatSession = useCreateChatSession();
  const slashCommandHandler = useSlashCommandHandler();

  // Set active tab via NavigationContext
  const setActiveTabId = useCallback(
    (tabId: string) => {
      if (selectedWorkspace) {
        setWorkspaceTab(selectedWorkspace, tabId);
      }
    },
    [selectedWorkspace, setWorkspaceTab],
  );

  // Auto-select first tab if none is active
  const activeTabId = activeTab || workspace?.tabs?.[0]?.id || '';

  const [refreshKey, setRefreshKey] = useState(0);
  const queryClient = useQueryClient();

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

  const activeTabObject = workspace?.tabs?.find(
    (t: any) => t.id === activeTabId,
  );
  const agent = agents.find((a) => a.slug === workspace?.defaultAgent);

  const handleLaunchPrompt = useCallback(
    async (prompt: any) => {
      const targetAgent = agents.find(
        (a) => a.slug === (prompt.agent || workspace?.defaultAgent),
      );
      if (!targetAgent) return;

      const sessionId = createChatSession(
        targetAgent.slug,
        targetAgent.name,
        prompt.label,
      );
      setDockState(true);
      setActiveChat(sessionId);

      await sendMessage(sessionId, targetAgent.slug, undefined, prompt.prompt);
    },
    [
      agents,
      workspace?.defaultAgent,
      createChatSession,
      sendMessage,
      setDockState,
      setActiveChat,
    ],
  );

  const handleRefresh = useCallback(() => {
    // Clear sessionStorage keys for this workspace
    const prefix = `workspace:${selectedWorkspace}`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => sessionStorage.removeItem(key));

    // Invalidate React Query cache for active tab data
    queryClient.invalidateQueries({ queryKey: ['calendar'] });
    queryClient.invalidateQueries({ queryKey: ['crm'] });
    queryClient.invalidateQueries({ queryKey: ['user'] });

    // Increment refresh key to force remount
    setRefreshKey((prev) => prev + 1);
  }, [selectedWorkspace, queryClient]);

  const { data: allWorkspaces = [] } = useWorkspacesQuery();

  // No workspace selected — auto-select first available or show onboarding
  if (!selectedWorkspace) {
    if (allWorkspaces.length > 0) {
      setWorkspace(allWorkspaces[0].slug);
      return <FullScreenLoader label="workspace" />;
    }
    return <EmptyWorkspaceOnboarding />;
  }

  // Selected workspace doesn't exist — redirect to first available or root
  if (allWorkspaces.length > 0 && !allWorkspaces.some((w: any) => w.slug === selectedWorkspace)) {
    setWorkspace(allWorkspaces[0].slug);
    return <FullScreenLoader label="workspace" />;
  }

  // Backend unreachable
  if (!backendChecking && !backendReady) {
    return (
      <FullScreenError
        title="Unable to connect"
        description={`The server at <code>${apiBase}</code> is not responding`}
        onRetry={retryBackend}
        retryLabel="Retry Connection"
      />
    );
  }

  // Query failed — workspace might have been deleted between list fetch and detail fetch
  if (isError && !isLoading) {
    const workspaceExists = allWorkspaces.some(
      (w: any) => w.slug === selectedWorkspace,
    );
    if (!workspaceExists && allWorkspaces.length > 0) {
      setWorkspace(allWorkspaces[0].slug);
      return <FullScreenLoader label="workspace" />;
    }
    if (!workspaceExists) {
      return <EmptyWorkspaceOnboarding />;
    }
    return (
      <FullScreenError
        title="Failed to load workspace"
        description="Something went wrong loading this workspace. It might be a temporary issue."
        onRetry={() => refetch()}
      />
    );
  }

  if (isLoading || backendChecking || !workspace) {
    return <FullScreenLoader label="workspace" />;
  }

  return (
    <SDKAdapter workspace={workspace}>
      <WorkspaceNavigationProvider
        activeTabId={activeTabId}
        workspaceSlug={workspace?.slug}
      >
        <WorkspaceRenderer
          workspace={workspace}
          activeTab={activeTabObject}
          activeTabId={activeTabId}
          onTabChange={setActiveTabId}
          agent={agent as any}
          componentId={activeTabObject?.component}
          onLaunchPrompt={handleLaunchPrompt}
          onShowChat={() => setDockState(true)}
          refreshKey={refreshKey}
          onRefresh={handleRefresh}
        />
      </WorkspaceNavigationProvider>
    </SDKAdapter>
  );
}

function EmptyWorkspaceOnboarding() {
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
          Workspaces give you a custom dashboard with tabs, agents, and tools.
          Get started by creating one or installing a plugin.
        </p>
        <div className="workspace-onboarding__actions">
          <button
            className="workspace-onboarding__card"
            onClick={() => navigate('/manage/workspaces')}
          >
            <span className="workspace-onboarding__card-icon">✨</span>
            <div>
              <div className="workspace-onboarding__card-title">
                Create a Workspace
              </div>
              <div className="workspace-onboarding__card-desc">
                Build a custom workspace with your own tabs and agents
              </div>
            </div>
          </button>
          <button
            className="workspace-onboarding__card"
            onClick={() => navigate('/manage/plugins')}
          >
            <span className="workspace-onboarding__card-icon">🧩</span>
            <div>
              <div className="workspace-onboarding__card-title">
                Install a Plugin
              </div>
              <div className="workspace-onboarding__card-desc">
                Add a pre-built workspace from a git repo or local path
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
