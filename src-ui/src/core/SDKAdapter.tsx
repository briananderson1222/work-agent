import { ReactNode } from 'react';
import { SDKProvider, type SDKContextValue } from '@stallion-ai/sdk';
import { useAgents } from '../contexts/AgentsContext';
import { useWorkspaces } from '../contexts/WorkspacesContext';
import { useConversations } from '../contexts/ConversationsContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useToast } from '../contexts/ToastContext';
import { useSendMessage, useCreateChatSession } from '../contexts/ActiveChatsContext';
import { useApiBase } from '../contexts/ConfigContext';

interface SDKAdapterProps {
  children: ReactNode;
  authToken?: string;
}

/**
 * SDKAdapter - Provides SDK context to plugin components
 * Injects core app contexts into the SDK for plugin consumption
 */
export function SDKAdapter({ children, authToken }: SDKAdapterProps) {
  // Get API base from the single source of truth
  const { apiBase } = useApiBase();
  
  // Get all the core contexts
  const agents = useAgents(apiBase);
  const workspaces = useWorkspaces(apiBase);
  const conversations = useConversations();
  const navigation = useNavigation();
  const toast = useToast();
  const sendMessage = useSendMessage(apiBase);
  const createChatSession = useCreateChatSession();

  // Create SDK context value with injected contexts
  const sdkValue: SDKContextValue = {
    apiBase,
    contexts: {
      agents: { useAgents: () => agents },
      workspaces: { useWorkspaces: () => workspaces },
      conversations: { useConversations: () => conversations },
      navigation: { useNavigation: () => navigation },
      toast: { useToast: () => toast },
      activeChats: { 
        useSendMessage: () => sendMessage,
        useCreateChatSession: () => createChatSession 
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
