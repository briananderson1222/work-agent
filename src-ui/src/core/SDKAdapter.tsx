import {
  _setApiBase,
  _setProviderFunctions,
  _setWorkspaceContext,
  SDKProvider,
  useWorkspacesQuery,
} from '@stallion-ai/sdk';
import { type ReactNode, useEffect } from 'react';
import {
  useActiveChatActions,
  useCreateChatSession,
  useOpenConversation,
  useSendMessage,
} from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useAuth } from '../contexts/AuthContext';
import { useConversations } from '../contexts/ConversationsContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useToast } from '../contexts/ToastContext';
import type { WorkspaceConfig } from '../types';
import {
  configureProvider,
  getActiveProviderId,
  getProvider,
  hasProvider,
  registerProvider,
} from './workspaceProviders';

interface SDKAdapterProps {
  children: ReactNode;
  authToken?: string;
  workspace?: WorkspaceConfig;
}

/**
 * SDKAdapter - Provides SDK context to plugin components
 * Injects core app contexts into the SDK for plugin consumption
 */
export function SDKAdapter({ children, workspace }: SDKAdapterProps) {
  // Get API base from the single source of truth
  const { apiBase } = useApiBase();

  // Set API base and workspace context for SDK API functions
  useEffect(() => {
    _setApiBase(apiBase);
    _setWorkspaceContext(workspace);

    // Inject provider functions into SDK
    _setProviderFunctions({
      getProvider,
      hasProvider,
      getActiveProviderId,
      registerProvider,
      configureProvider,
    });

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
  const openConversation = useOpenConversation(apiBase);
  const auth = useAuth();

  // Create SDK context value with injected contexts
  const sdkValue = {
    apiBase,
    contexts: {
      agents: { useAgents: () => agents },
      workspaces: { useWorkspaces: () => workspaces },
      conversations: { useConversations: () => conversations },
      navigation: { useNavigation: () => navigation },
      toast: { useToast: () => toast },
      config: { useApiBase: () => ({ apiBase }) },
      auth: { useAuth: () => auth },
      activeChats: {
        useSendMessage: () => sendMessage,
        useCreateChatSession: () => createChatSession,
        useActiveChatActions: () => activeChatActions,
        useOpenConversation: () => openConversation,
      },
    },
    hooks: {
      // Add other hooks as needed
    },
  };

  return <SDKProvider value={sdkValue as any}>{children as any}</SDKProvider>;
}
