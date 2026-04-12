import {
  FullScreenError,
  FullScreenLoader,
  fetchPromptById,
  LayoutNavigationProvider,
  useProjectLayoutQuery,
} from '@stallion-ai/sdk';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { SDKAdapter } from '../core/SDKAdapter';
import {
  useCreateChatSession,
  useSendMessage,
} from '../hooks/useActiveChatSessions';
import { useSlashCommandHandler } from '../hooks/useSlashCommandHandler';
import { LayoutRenderer } from '../layouts';

export function LayoutView({
  projectSlug,
  layoutSlug,
}: {
  projectSlug: string;
  layoutSlug: string;
}) {
  const { apiBase } = useApiBase();
  const { activeTab, setDockState, setLayoutTab, setActiveChat, navigate } =
    useNavigation();

  const agents = useAgents();
  const {
    data: layoutData,
    isLoading: layoutLoading,
    error: layoutQueryError,
    refetch: refetchLayout,
  } = useProjectLayoutQuery(projectSlug, layoutSlug);

  // Map LayoutConfig → workspace shape
  const layout = layoutData
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

  const createChatSession = useCreateChatSession();
  const slashCommandHandler = useSlashCommandHandler();

  // Set active tab via NavigationContext
  const setActiveTabId = useCallback(
    (tabId: string) => {
      setLayoutTab(layoutSlug, tabId);
    },
    [layoutSlug, setLayoutTab],
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
          openNewChat: () => {},
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

      // Resolve prompt content: if id looks like a plugin prompt ref (e.g. "sales-sa:activity"),
      // fetch the actual prompt content from the server
      let promptText = prompt.prompt;
      if (prompt.id?.includes(':') && promptText === prompt.label) {
        try {
          const promptData = await fetchPromptById(prompt.id);
          if (promptData?.content) {
            promptText = promptData.content;
          }
        } catch {
          /* fall through to label */
        }
      }

      const sessionId = createChatSession(
        targetAgent.slug,
        targetAgent.name,
        prompt.label,
        projectSlug,
      );
      setDockState(true);
      setActiveChat(null); // New chat, no conversation yet

      await sendMessage(sessionId, targetAgent.slug, undefined, promptText);
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
    const slug = layoutSlug;
    const prefixes = [`layout:${slug}`, `layout-${slug}-tab-`];
    prefixes.push(`layout:${projectSlug}:${slug}`);

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
  }, [projectSlug, layoutSlug, queryClient]);

  // Project layout failed — layout doesn't exist, redirect to project page
  const layoutErrorMessage =
    layoutQueryError instanceof Error ? layoutQueryError.message : null;

  if (
    layoutErrorMessage?.toLowerCase().includes('not found') &&
    !layoutLoading
  ) {
    try {
      localStorage.removeItem('lastProjectLayout');
    } catch {}
    navigate(`/projects/${projectSlug}`);
    return <FullScreenLoader label="layout" />;
  }

  if (layoutQueryError && !layoutLoading) {
    return (
      <FullScreenError
        title="Failed to load layout"
        description="Something went wrong loading this layout. It might be a temporary issue."
        onRetry={() => refetchLayout()}
      />
    );
  }

  if (layoutLoading || !layout) {
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
