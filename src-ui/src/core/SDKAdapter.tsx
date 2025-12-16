import { ReactNode, useEffect } from 'react';
import { SDKProvider, type SDKContextValue, _setWorkspaceContext, _setApiBase, useWorkspacesQuery } from '@stallion-ai/sdk';
import { useAgents } from '../contexts/AgentsContext';
import { useConversations } from '../contexts/ConversationsContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useToast } from '../contexts/ToastContext';
import { useSendMessage, useCreateChatSession, useActiveChatActions } from '../contexts/ActiveChatsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import type { WorkspaceConfig } from '../types';

interface SDKAdapterProps {
  children: ReactNode;
  authToken?: string;
  workspace?: WorkspaceConfig;
}

/**
 * SDKAdapter - Provides SDK context to plugin components
 * Injects core app contexts into the SDK for plugin consumption
 */
export function SDKAdapter({ children, authToken, workspace }: SDKAdapterProps) {
  // Get API base from the single source of truth
  const { apiBase } = useApiBase();
  
  // Set API base and workspace context for SDK API functions
  useEffect(() => {
    _setApiBase(apiBase);
    _setWorkspaceContext(workspace);
    return () => {
      _setWorkspaceContext(undefined);
    };
  }, [apiBase, workspace]);
  
  // Get all the core contexts
  const agents = useAgents();
  const { data: workspaces = [] } = useWorkspacesQuery();
  const conversations = useConversations(workspace?.slug || '');
  const navigation = useNavigation();
  const toast = useToast();
  const sendMessage = useSendMessage(apiBase);
  const createChatSession = useCreateChatSession();
  const activeChatActions = useActiveChatActions();

  // Create SDK context value with injected contexts
  const sdkValue: SDKContextValue = {
    apiBase,
    contexts: {
      agents: { useAgents: () => agents },
      workspaces: { useWorkspaces: () => workspaces },
      conversations: { useConversations: () => conversations },
      navigation: { useNavigation: () => navigation },
      toast: { useToast: () => toast },
      config: { useApiBase: () => ({ apiBase }) },
      activeChats: { 
        useSendMessage: () => sendMessage,
        useCreateChatSession: () => createChatSession,
        useActiveChatActions: () => activeChatActions
      },
    },
    hooks: {
      // Add other hooks as needed
    }
  };

  return (
    <SDKProvider value={sdkValue}>
      {children}
    </SDKProvider>
  );
}
