import { useQueryClient } from '@tanstack/react-query';
import {
  useWorkspaceQuery,
  useWorkspacesQuery,
  WorkspaceNavigationProvider,
} from '@work-agent/sdk';
import { useCallback, useEffect, useState } from 'react';
import {
  useCreateChatSession,
  useSendMessage,
} from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { pluginRegistry } from '../core/PluginRegistry';
import { SDKAdapter } from '../core/SDKAdapter';
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
  const slashCommandHandler = useSlashCommandHandler(apiBase);

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
      return await slashCommandHandler(sessionId, content);
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

  if (!selectedWorkspace) {
    if (allWorkspaces.length === 0) {
      return <EmptyWorkspaceOnboarding />;
    }
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Select a workspace from the sidebar to get started.</p>
      </div>
    );
  }

  // Backend unreachable
  if (!backendChecking && !backendReady) {
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--text-secondary)',
        }}
      >
        <p style={{ marginBottom: '0.75rem' }}>
          Unable to connect to backend server
        </p>
        <p style={{ fontSize: '0.85rem', marginBottom: '1rem', opacity: 0.7 }}>
          The server at {apiBase} is not responding
        </p>
        <button className="button button--secondary" onClick={retryBackend}>
          Retry Connection
        </button>
      </div>
    );
  }

  // Query failed after backend was reachable — if workspace doesn't exist, show onboarding
  if (isError && !isLoading) {
    const workspaceExists = allWorkspaces.some(
      (w: any) => w.slug === selectedWorkspace,
    );
    if (!workspaceExists) {
      return <EmptyWorkspaceOnboarding />;
    }
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--text-secondary)',
        }}
      >
        <p style={{ marginBottom: '0.75rem' }}>Failed to load workspace</p>
        <button className="button button--secondary" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  if (isLoading || backendChecking || !workspace) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading workspace...</p>
      </div>
    );
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
          agent={agent || null}
          componentId={activeTabObject?.component}
          onLaunchPrompt={handleLaunchPrompt}
          onShowChat={() => setDockState(true)}
          pluginRegistry={pluginRegistry}
          refreshKey={refreshKey}
          onRefresh={handleRefresh}
        />
      </WorkspaceNavigationProvider>
    </SDKAdapter>
  );
}

function EmptyWorkspaceOnboarding() {
  const { navigate } = useNavigation();

  return (
    <div className="workspace-onboarding">
      <div className="workspace-onboarding__inner">
        <img src="/favicon.png" alt="" className="workspace-onboarding__icon" />
        <h2 className="workspace-onboarding__title">
          Welcome to Project Stallion
        </h2>
        <p className="workspace-onboarding__desc">
          Workspaces give you a custom dashboard with tabs, agents, and tools.
          Get started by creating one or installing a plugin.
        </p>
        <div className="workspace-onboarding__actions">
          <button
            className="workspace-onboarding__card"
            onClick={() => navigate('/workspaces/new')}
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
            onClick={() => navigate('/plugins')}
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
