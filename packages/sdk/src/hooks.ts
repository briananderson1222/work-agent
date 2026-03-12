/**
 * SDK Hooks - Wraps core app contexts for plugin consumption
 *
 * These hooks provide a stable API for plugins to access core functionality.
 * They delegate to the actual context implementations in the core app.
 */

import { useCallback, useContext, useEffect, useState } from 'react';
import { resolveAgentName } from './agentResolver';
import { _getApiBase, _getPluginName } from './api';
import { SDKContext } from './providers';
import { useProjectQuery, useProjectsQuery } from './queries';
import type { AgentSummary } from './types';

// SDK Context Access
export function useSDK() {
  const sdk = useContext(SDKContext);
  if (!sdk) throw new Error('SDK context not available');
  return { apiBase: sdk.apiBase };
}

// Agent Management
export function useAgents() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.agents) throw new Error('AgentsContext not available');
  return sdk.contexts.agents.useAgents();
}

export function useAgent(slug: string) {
  const agents = useAgents();
  return agents.find((a: AgentSummary) => a.slug === slug);
}

export function useResolveAgent(agentSlug: string) {
  const layouts = useLayouts();
  const navigation = useNavigation();
  const currentLayout = layouts.find(
    (w: any) => w.slug === navigation.selectedLayout,
  );

  if (agentSlug.includes(':')) {
    return agentSlug;
  }

  if (currentLayout?.availableAgents) {
    const match = currentLayout.availableAgents.find((a: string) =>
      a.endsWith(`:${agentSlug}`),
    );
    if (match) return match;
  }

  return agentSlug;
}

// Layout Management
export function useLayouts() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.layouts) throw new Error('LayoutsContext not available');
  return sdk.contexts.layouts.useLayouts();
}

export function useLayout(slug: string, enabled = true) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.layouts) throw new Error('LayoutsContext not available');
  return sdk.contexts.layouts.useLayout(slug, enabled);
}

// Project Management
export function useProjects() {
  return useProjectsQuery();
}

export function useProject(slug: string) {
  return useProjectQuery(slug);
}

// Conversation Management
export function useConversations(agentSlug?: string) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.conversations)
    throw new Error('ConversationsContext not available');
  return sdk.contexts.conversations.useConversations(agentSlug);
}

export function useConversation(conversationId: string) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.conversations)
    throw new Error('ConversationsContext not available');
  return sdk.contexts.conversations.useConversation(conversationId);
}

export function useConversationMessages(conversationId: string) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.conversations)
    throw new Error('ConversationsContext not available');
  return sdk.contexts.conversations.useConversationMessages(conversationId);
}

// Chat Operations
export function useCreateChatSession() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.activeChats)
    throw new Error('ActiveChatsContext not available');
  return sdk.contexts.activeChats.useCreateChatSession();
}

/** Open/resume an existing conversation in the chat dock. Returns the session ID. */
export function useOpenConversation() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.activeChats?.useOpenConversation)
    throw new Error('ActiveChatsContext not available');
  return sdk.contexts.activeChats.useOpenConversation();
}

export function useSendMessage() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.activeChats)
    throw new Error('ActiveChatsContext not available');
  return sdk.contexts.activeChats.useSendMessage();
}

export function useActiveChatActions(sessionId: string) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.activeChats)
    throw new Error('ActiveChatsContext not available');
  return sdk.contexts.activeChats.useActiveChatActions(sessionId);
}

export function useActiveChatState(sessionId: string) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.activeChats)
    throw new Error('ActiveChatsContext not available');
  return sdk.contexts.activeChats.useActiveChatState(sessionId);
}

// Models
export function useModels() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.models) throw new Error('ModelsContext not available');
  return sdk.contexts.models.useModels();
}

export function useAvailableModels() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.models) throw new Error('ModelsContext not available');
  return sdk.contexts.models.useAvailableModels();
}

// Configuration
export function useApiBase() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.config) throw new Error('ConfigContext not available');
  return sdk.contexts.config.useApiBase();
}

const fallbackAuth = {
  useAuth: () => ({
    status: 'missing' as const,
    user: null,
    expiresAt: null,
    provider: '',
    renew: async () => {},
    isRenewing: false,
  }),
};

export function useAuth() {
  const sdk = useContext(SDKContext);
  const authContext = sdk?.contexts?.auth ?? fallbackAuth;
  return authContext.useAuth();
}

export function useConfig() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.config) throw new Error('ConfigContext not available');
  return sdk.contexts.config.useConfig();
}

// Navigation
export function useNavigation() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.navigation)
    throw new Error('NavigationContext not available');
  return sdk.contexts.navigation.useNavigation();
}

export function useDockState() {
  const navigation = useNavigation();
  return {
    isOpen: navigation.dockState,
    setOpen: navigation.setDockState,
    toggle: () => navigation.setDockState(!navigation.dockState),
  };
}

// Toast Notifications
export function useToast() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.toast) throw new Error('ToastContext not available');
  return sdk.contexts.toast.useToast();
}

// Generic Notification System
export function useNotifications() {
  const toast = useToast();
  const sdk = useContext(SDKContext);
  const apiBase = sdk?.apiBase ?? '';

  return {
    /** Show an immediate toast notification (backward compat) */
    notify: (
      message: string,
      options?: {
        type?: 'info' | 'warning' | 'error' | 'success';
        duration?: number;
      },
    ) => {
      toast.showToast(message, options?.type || 'info', options?.duration);
    },
    /** Schedule a notification via the server */
    schedule: async (opts: {
      category: string;
      title: string;
      body?: string;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      scheduledAt?: string;
      ttl?: number;
      actions?: Array<{
        id: string;
        label: string;
        variant?: 'primary' | 'secondary' | 'danger';
      }>;
      metadata?: Record<string, unknown>;
      dedupeTag?: string;
    }) => {
      const res = await fetch(`${apiBase}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'sdk', ...opts }),
      });
      if (!res.ok)
        throw new Error(`Failed to schedule notification: ${res.statusText}`);
      return res.json();
    },
    /** Dismiss a notification */
    dismiss: async (id: string) => {
      await fetch(`${apiBase}/api/notifications/${id}`, { method: 'DELETE' });
    },
  };
}

// Slash Commands
export function useSlashCommandHandler() {
  const sdk = useContext(SDKContext);
  if (!sdk?.hooks?.slashCommandHandler)
    throw new Error('useSlashCommandHandler not available');
  return sdk.hooks.slashCommandHandler();
}

export function useSlashCommands() {
  const sdk = useContext(SDKContext);
  if (!sdk?.hooks?.slashCommands)
    throw new Error('useSlashCommands not available');
  return sdk.hooks.slashCommands();
}

// Tool Approval
export function useToolApproval() {
  const sdk = useContext(SDKContext);
  if (!sdk?.hooks?.toolApproval)
    throw new Error('useToolApproval not available');
  return sdk.hooks.toolApproval();
}

// Statistics
export function useStats() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.stats) throw new Error('StatsContext not available');
  return sdk.contexts.stats.useStats();
}

export function useConversationStats(conversationId?: string) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.stats) throw new Error('StatsContext not available');
  return sdk.contexts.stats.useConversationStats(conversationId);
}

// Keyboard Shortcuts
export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  deps?: any[],
) {
  const sdk = useContext(SDKContext);
  if (!sdk?.hooks?.keyboardShortcut)
    throw new Error('useKeyboardShortcut not available');
  return sdk.hooks.keyboardShortcut(key, callback, deps);
}

export function useKeyboardShortcuts() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.keyboardShortcuts)
    throw new Error('KeyboardShortcutsContext not available');
  return sdk.contexts.keyboardShortcuts.useKeyboardShortcuts();
}

// Workflows
export function useWorkflows(agentSlug?: string) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.workflows)
    throw new Error('WorkflowsContext not available');
  return sdk.contexts.workflows.useWorkflows(agentSlug);
}

export function useWorkflowFiles(agentSlug: string) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.workflows)
    throw new Error('WorkflowsContext not available');
  return sdk.contexts.workflows.useWorkflowFiles(agentSlug);
}

// Chat Utilities

/**
 * Hook to send a message to chat and open the dock.
 * Plugins MUST specify the agent slug - there is no default.
 *
 * @param agentSlug - The agent to send messages to (required). Can be short name (e.g., 'my-agent')
 *                    which will be resolved using current layout context, or fully qualified
 *                    (e.g., 'sa-agent:stallion-agent').
 * @returns Function to send a message and open chat
 *
 * @example
 * ```typescript
 * const sendToChat = useSendToChat('my-agent');
 * sendToChat('Summarize this account');
 * ```
 */
export function useSendToChat(agentSlug: string) {
  const agents = useAgents();
  const createChatSession = useCreateChatSession();
  const navigation = useNavigation();
  const sendMessage = useSendMessage();

  return useCallback(
    (message: string) => {
      // Resolve short name to full slug using layout context
      const resolvedSlug = resolveAgentName(agentSlug);
      const agent = agents.find((a: any) => a.slug === resolvedSlug);
      if (!agent) {
        console.warn(
          `[useSendToChat] Agent '${agentSlug}' (resolved: '${resolvedSlug}') not found`,
        );
        return;
      }
      const sessionId = createChatSession(resolvedSlug, agent.name);
      navigation.setDockState(true);
      navigation.setActiveChat(sessionId);
      sendMessage(sessionId, resolvedSlug, undefined, message);
    },
    [agents, agentSlug, createChatSession, navigation, sendMessage],
  );
}

/**
 * Hook to look up a user by alias via the user directory provider.
 * Returns { data, loading, error } for the given alias.
 */
export function useUserLookup(alias: string | null) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!alias) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    _getApiBase()
      .then((apiBase) =>
        fetch(`${apiBase}/api/users/${encodeURIComponent(alias)}`),
      )
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [alias]);

  return { data, loading, error };
}

/**
 * Server-side fetch proxy for plugins.
 * Requires `network.fetch` permission in plugin.json.
 * Returns a fetch-like function that routes through the backend to avoid CORS.
 */
export function useServerFetch() {
  return useCallback(
    async (
      url: string,
      options?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      },
    ) => {
      const apiBase = await _getApiBase();
      const pluginName = _getPluginName();
      const fetchUrl = pluginName
        ? `${apiBase}/api/plugins/${encodeURIComponent(pluginName)}/fetch`
        : `${apiBase}/api/plugins/fetch`;

      const resp = await fetch(fetchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          method: options?.method,
          headers: options?.headers,
          body: options?.body,
        }),
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'Server fetch failed');
      return {
        status: data.status,
        contentType: data.contentType,
        body: data.body,
      } as { status: number; contentType: string; body: string };
    },
    [],
  );
}
