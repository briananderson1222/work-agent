import type { ConnectionConfig } from '@stallion-ai/contracts/tool';
import { useRuntimeConnectionsQuery } from '@stallion-ai/sdk';
import { useState } from 'react';
import type { AgentData } from '../../contexts/AgentsContext';
import { useApiBase } from '../../contexts/ApiBaseContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '../../contexts/NavigationContext';
import {
  useCreateChatSession,
  useSendMessage,
} from '../../hooks/useActiveChatSessions';
import { useShortcutDisplay } from '../../hooks/useKeyboardShortcut';
import type { NavigationView } from '../../types';
import {
  canAgentStartChat,
  resolveAgentExecution,
} from '../../utils/execution';
import { getInitials } from '../../utils/layout';
import { getHeaderBreadcrumb, getHelpPrompts } from './utils';

interface UseHeaderViewModelOptions {
  currentView?: NavigationView;
  agents: AgentData[];
  onNavigate: (view: NavigationView) => void;
}

export function useHeaderViewModel({
  currentView,
  agents,
  onNavigate,
}: UseHeaderViewModelOptions) {
  const settingsShortcut = useShortcutDisplay('app.settings');
  const { setDockState, setActiveChat, navigate } = useNavigation();
  const { apiBase } = useApiBase();
  const { user: authUser } = useAuth();
  const createChatSession = useCreateChatSession();
  const sendMessage = useSendMessage(apiBase);
  const { data: runtimeConnections = [] } = useRuntimeConnectionsQuery() as {
    data?: ConnectionConfig[];
  };

  const [showHelp, setShowHelp] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);

  const helpPrompts = getHelpPrompts(currentView);
  const breadcrumb = getHeaderBreadcrumb(currentView);
  const userName = authUser?.name || authUser?.alias || 'User';
  const userInitials = getInitials(userName);

  function handleHelpPrompt(prompt: string) {
    setShowHelp(false);
    setDockState(true);
    const chatTarget = agents.find(
      (agent) =>
        agent.slug.startsWith('__runtime:') ||
        canAgentStartChat(agent, runtimeConnections),
    );
    if (!chatTarget) {
      navigate('/connections/runtimes');
      return;
    }
    const sessionId = createChatSession(
      chatTarget.slug,
      chatTarget.name,
      undefined,
      undefined,
      undefined,
      resolveAgentExecution(chatTarget),
    );
    setActiveChat(null);
    setTimeout(() => {
      sendMessage(sessionId, chatTarget.slug, undefined, prompt);
    }, 100);
  }

  return {
    breadcrumb,
    helpPrompts,
    settingsShortcut,
    showConnectionModal,
    showHelp,
    showNotifications,
    showOverflow,
    userInitials,
    closeConnectionModal: () => setShowConnectionModal(false),
    closeHelp: () => setShowHelp(false),
    closeNotifications: () => setShowNotifications(false),
    closeOverflow: () => setShowOverflow(false),
    handleHelpPrompt,
    openConnectionModal: () => setShowConnectionModal(true),
    toggleHelp: () => setShowHelp((current) => !current),
    toggleNotifications: () => setShowNotifications((current) => !current),
    toggleOverflow: () => setShowOverflow((current) => !current),
    goHome: () => navigate('/'),
    openProfile: () => {
      if (currentView?.type === 'profile') {
        navigate('/');
      } else {
        onNavigate({ type: 'profile' });
      }
    },
  };
}
