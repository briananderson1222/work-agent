/**
 * SDK Hooks - Wraps core app contexts for plugin consumption
 * 
 * These hooks provide a stable API for plugins to access core functionality.
 * They delegate to the actual context implementations in the core app.
 */

import { useContext, useCallback } from 'react';
import { SDKContext } from './providers';
import { resolveAgentName } from './agentResolver';
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
  const workspaces = useWorkspaces();
  const navigation = useNavigation();
  const currentWorkspace = workspaces.find((w: any) => w.slug === navigation.selectedWorkspace);
  
  if (agentSlug.includes(':')) {
    return agentSlug;
  }
  
  if (currentWorkspace?.availableAgents) {
    const match = currentWorkspace.availableAgents.find((a: string) => 
      a.endsWith(`:${agentSlug}`)
    );
    if (match) return match;
  }
  
  return agentSlug;
}

// Workspace Management
export function useWorkspaces() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.workspaces) throw new Error('WorkspacesContext not available');
  return sdk.contexts.workspaces.useWorkspaces();
}

export function useWorkspace(slug: string, enabled = true) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.workspaces) throw new Error('WorkspacesContext not available');
  return sdk.contexts.workspaces.useWorkspace(slug, enabled);
}

// Conversation Management
export function useConversations(agentSlug?: string) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.conversations) throw new Error('ConversationsContext not available');
  return sdk.contexts.conversations.useConversations(agentSlug);
}

export function useConversation(conversationId: string) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.conversations) throw new Error('ConversationsContext not available');
  return sdk.contexts.conversations.useConversation(conversationId);
}

export function useConversationMessages(conversationId: string) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.conversations) throw new Error('ConversationsContext not available');
  return sdk.contexts.conversations.useConversationMessages(conversationId);
}

// Chat Operations
export function useCreateChatSession() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.activeChats) throw new Error('ActiveChatsContext not available');
  return sdk.contexts.activeChats.useCreateChatSession();
}

export function useSendMessage() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.activeChats) throw new Error('ActiveChatsContext not available');
  return sdk.contexts.activeChats.useSendMessage();
}

export function useActiveChatActions(sessionId: string) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.activeChats) throw new Error('ActiveChatsContext not available');
  return sdk.contexts.activeChats.useActiveChatActions(sessionId);
}

export function useActiveChatState(sessionId: string) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.activeChats) throw new Error('ActiveChatsContext not available');
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

export function useConfig() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.config) throw new Error('ConfigContext not available');
  return sdk.contexts.config.useConfig();
}

// Navigation
export function useNavigation() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.navigation) throw new Error('NavigationContext not available');
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
  
  return {
    notify: (message: string, options?: { 
      type?: 'info' | 'warning' | 'error' | 'success';
      duration?: number;
    }) => {
      toast.showToast(message, options?.type || 'info', options?.duration);
    },
  };
}

// Slash Commands
export function useSlashCommandHandler() {
  const sdk = useContext(SDKContext);
  if (!sdk?.hooks?.slashCommandHandler) throw new Error('useSlashCommandHandler not available');
  return sdk.hooks.slashCommandHandler();
}

export function useSlashCommands() {
  const sdk = useContext(SDKContext);
  if (!sdk?.hooks?.slashCommands) throw new Error('useSlashCommands not available');
  return sdk.hooks.slashCommands();
}

// Tool Approval
export function useToolApproval() {
  const sdk = useContext(SDKContext);
  if (!sdk?.hooks?.toolApproval) throw new Error('useToolApproval not available');
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
export function useKeyboardShortcut(key: string, callback: () => void, deps?: any[]) {
  const sdk = useContext(SDKContext);
  if (!sdk?.hooks?.keyboardShortcut) throw new Error('useKeyboardShortcut not available');
  return sdk.hooks.keyboardShortcut(key, callback, deps);
}

export function useKeyboardShortcuts() {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.keyboardShortcuts) throw new Error('KeyboardShortcutsContext not available');
  return sdk.contexts.keyboardShortcuts.useKeyboardShortcuts();
}

// Workflows
export function useWorkflows(agentSlug?: string) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.workflows) throw new Error('WorkflowsContext not available');
  return sdk.contexts.workflows.useWorkflows(agentSlug);
}

export function useWorkflowFiles(agentSlug: string) {
  const sdk = useContext(SDKContext);
  if (!sdk?.contexts?.workflows) throw new Error('WorkflowsContext not available');
  return sdk.contexts.workflows.useWorkflowFiles(agentSlug);
}

// Chat Utilities

/**
 * Hook to send a message to chat and open the dock.
 * Plugins MUST specify the agent slug - there is no default.
 * 
 * @param agentSlug - The agent to send messages to (required). Can be short name (e.g., 'work-agent') 
 *                    which will be resolved using current workspace context, or fully qualified 
 *                    (e.g., 'stallion-workspace:work-agent').
 * @returns Function to send a message and open chat
 * 
 * @example
 * ```typescript
 * const sendToChat = useSendToChat('work-agent');
 * sendToChat('Summarize this account');
 * ```
 */
export function useSendToChat(agentSlug: string) {
  const agents = useAgents();
  const createChatSession = useCreateChatSession();
  const navigation = useNavigation();
  const sendMessage = useSendMessage();

  return useCallback((message: string) => {
    // Resolve short name to full slug using workspace context
    const resolvedSlug = resolveAgentName(agentSlug);
    const agent = agents.find((a: any) => a.slug === resolvedSlug);
    if (!agent) {
      console.warn(`[useSendToChat] Agent '${agentSlug}' (resolved: '${resolvedSlug}') not found`);
      return;
    }
    const sessionId = createChatSession(resolvedSlug, agent.name);
    navigation.setDockState(true);
    navigation.setActiveChat(sessionId);
    sendMessage(sessionId, resolvedSlug, undefined, message);
  }, [agents, agentSlug, createChatSession, navigation, sendMessage]);
}
