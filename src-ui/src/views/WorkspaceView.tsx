import { useState, useEffect, useCallback } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import { useApiBase } from '../contexts/ConfigContext';
import { useWorkspace } from '../contexts/WorkspacesContext';
import { useAgents } from '../contexts/AgentsContext';
import { useCreateChatSession } from '../contexts/ActiveChatsContext';
import { useSendMessage } from '../contexts/ActiveChatsContext';
import { useSlashCommandHandler } from '../hooks/useSlashCommandHandler';
import { WorkspaceRenderer } from '../workspaces';
import { SDKAdapter } from '../core/SDKAdapter';
import { pluginRegistry } from '../core/PluginRegistry';
import { WorkspaceNavigationProvider } from '@stallion-ai/sdk';

export function WorkspaceView() {
  const { apiBase } = useApiBase();
  const { selectedWorkspace, activeTab, setDockState, setWorkspaceTab } = useNavigation();
  
  const agents = useAgents(apiBase);
  const workspace = useWorkspace(apiBase, selectedWorkspace || '', !!selectedWorkspace);
  const createChatSession = useCreateChatSession();
  const slashCommandHandler = useSlashCommandHandler(apiBase);
  
  // Set active tab via NavigationContext
  const setActiveTabId = useCallback((tabId: string) => {
    if (selectedWorkspace) {
      setWorkspaceTab(selectedWorkspace, tabId);
    }
  }, [selectedWorkspace, setWorkspaceTab]);
  
  const activeTabId = activeTab || '';
  
  const [pluginsLoaded, setPluginsLoaded] = useState(false);
  
  // Initialize plugin registry
  useEffect(() => {
    pluginRegistry.initialize().then(() => setPluginsLoaded(true));
  }, []);
  
  // Wrap slash command handler to match useSendMessage signature
  const handleSlashCommand = useCallback(async (sessionId: string, content: string) => {
    return await slashCommandHandler(sessionId, content);
  }, [slashCommandHandler]);
  
  const sendMessage = useSendMessage(apiBase, undefined, undefined, handleSlashCommand);

  // Set initial tab when workspace loads
  useEffect(() => {
    if (workspace?.tabs && workspace.tabs.length > 0) {
      if (!activeTabId || !workspace.tabs.find(t => t.id === activeTabId)) {
        setActiveTabId(workspace.tabs[0].id);
      }
    }
  }, [workspace?.slug, workspace?.tabs]);

  const activeTabObject = workspace?.tabs?.find((t: any) => t.id === activeTabId);
  const agent = agents.find(a => a.slug === workspace?.defaultAgent);

  const handleLaunchPrompt = useCallback(async (prompt: any) => {
    const targetAgent = agents.find(a => a.slug === (prompt.agent || workspace?.defaultAgent));
    if (!targetAgent) return;

    const sessionId = createChatSession(targetAgent.slug, targetAgent.name, prompt.label);
    setDockState(true);
    
    await sendMessage(sessionId, targetAgent.slug, undefined, prompt.prompt);
  }, [agents, workspace?.defaultAgent, createChatSession, sendMessage, setDockState]);

  if (!selectedWorkspace) {
    return (
      <div className="workspace-panel" style={{ padding: '2rem', textAlign: 'center' }}>
        <p>No workspace selected</p>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="workspace-panel" style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading workspace...</p>
      </div>
    );
  }

  return (
    <SDKAdapter>
      <WorkspaceNavigationProvider activeTabId={activeTabId} workspaceSlug={workspace?.slug}>
        {pluginsLoaded ? (
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
          />
        ) : (
          <div>Loading plugins...</div>
        )}
      </WorkspaceNavigationProvider>
    </SDKAdapter>
  );
}
