import {
  _setApiBase,
  _setProviderFunctions,
  _setLayoutContext,
  SDKProvider,
  useLayoutsQuery,
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
import type { StandaloneLayoutConfig } from '../types';
import {
  configureProvider,
  getActiveProviderId,
  getProvider,
  hasProvider,
  registerProvider,
} from './layoutProviders';

interface SDKAdapterProps {
  children: ReactNode;
  authToken?: string;
  layout?: StandaloneLayoutConfig;
}

/**
 * SDKAdapter - Provides SDK context to plugin components
 * Injects core app contexts into the SDK for plugin consumption
 */
export function SDKAdapter({
  children,
  layout,
}: SDKAdapterProps) {
  // Get API base from the single source of truth
  const { apiBase } = useApiBase();

  // Set layout context synchronously so plugin tool calls resolve correctly on first render
  _setApiBase(apiBase);
  _setLayoutContext(layout);

  // Set API base and layout context for SDK API functions
  useEffect(() => {
    _setProviderFunctions({
      getProvider,
      hasProvider,
      getActiveProviderId,
      registerProvider,
      configureProvider,
    });

    return () => {
      _setLayoutContext(undefined);
    };
  }, [apiBase, layout]);

  // Get all the core contexts
  const agents = useAgents();
  const { data: layouts = [] } = useLayoutsQuery();
  const conversations = useConversations(layout?.slug || '');
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
      layouts: { useLayouts: () => layouts },
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
