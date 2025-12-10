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
  const { selectedWorkspace, activeTab, setDockState, setWorkspaceTab, setActiveChat } = useNavigation();
  
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
  
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Wrap slash command handler to match useSendMessage signature
  const handleSlashCommand = useCallback(async (sessionId: string, content: string) => {
    return await slashCommandHandler(sessionId, content);
  }, [slashCommandHandler]);
  
  const sendMessage = useSendMessage(apiBase, undefined, undefined, handleSlashCommand);

  const activeTabObject = workspace?.tabs?.find((t: any) => t.id === activeTabId);
  const agent = agents.find(a => a.slug === workspace?.defaultAgent);

  const handleLaunchPrompt = useCallback(async (prompt: any) => {
    const targetAgent = agents.find(a => a.slug === (prompt.agent || workspace?.defaultAgent));
    if (!targetAgent) return;

    const sessionId = createChatSession(targetAgent.slug, targetAgent.name, prompt.label);
    setDockState(true);
    setActiveChat(sessionId);
    
    await sendMessage(sessionId, targetAgent.slug, undefined, prompt.prompt);
  }, [agents, workspace?.defaultAgent, createChatSession, sendMessage, setDockState, setActiveChat]);

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
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
    
    // Increment refresh key to force remount
    setRefreshKey(prev => prev + 1);
  }, [selectedWorkspace]);

  if (!selectedWorkspace) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>No workspace selected</p>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading workspace...</p>
      </div>
    );
  }

  return (
    <SDKAdapter workspace={workspace}>
      <WorkspaceNavigationProvider activeTabId={activeTabId} workspaceSlug={workspace?.slug}>
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
