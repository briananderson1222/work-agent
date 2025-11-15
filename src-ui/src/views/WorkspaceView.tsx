import { useState, useEffect, useCallback } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import { useApiBase } from '../contexts/ConfigContext';
import { useWorkspace } from '../contexts/WorkspacesContext';
import { useAgents } from '../contexts/AgentsContext';
import { useCreateChatSession } from '../contexts/ActiveChatsContext';
import { useSendMessage } from '../contexts/ActiveChatsContext';
import { WorkspaceRenderer } from '../workspaces';
import { SDKAdapter } from '../core/SDKAdapter';

export function WorkspaceView() {
  const { apiBase } = useApiBase();
  const { selectedWorkspace, setDockState } = useNavigation();
  
  const agents = useAgents(apiBase);
  const workspace = useWorkspace(apiBase, selectedWorkspace || '', !!selectedWorkspace);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const createChatSession = useCreateChatSession();
  const sendMessage = useSendMessage(apiBase);

  // Set initial tab when workspace loads
  useEffect(() => {
    if (workspace?.tabs && workspace.tabs.length > 0) {
      if (!activeTabId || !workspace.tabs.find(t => t.id === activeTabId)) {
        setActiveTabId(workspace.tabs[0].id);
      }
    }
  }, [workspace?.slug, workspace?.tabs]);

  const activeTab = workspace?.tabs?.find((t: any) => t.id === activeTabId);
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
    <SDKAdapter apiBase={apiBase}>
      <WorkspaceRenderer
        workspace={workspace}
        activeTab={activeTab}
        activeTabId={activeTabId}
        onTabChange={setActiveTabId}
        agent={agent || null}
        componentId={activeTab?.component}
        onLaunchPrompt={handleLaunchPrompt}
        onShowChat={() => setDockState(true)}
      />
    </SDKAdapter>
  );
}
