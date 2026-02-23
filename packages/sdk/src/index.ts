// Re-export all types
export * from './types';

// Re-export useQueryClient for contexts that need access to cache
export { useQueryClient } from '@tanstack/react-query';

// Re-export query hooks (plugins use these instead of raw React Query)
export {
  useTransformTool,
  useInvokeAgent,
  useApiQuery,
  useApiMutation,
  useInvalidateQuery,
  useWorkspaceQuery,
  useWorkspacesQuery,
  useUsageQuery,
  useAchievementsQuery,
  useAgentsQuery,
  useModelsQuery,
  useConversationsQuery,
  useConfigQuery,
  useModelCapabilitiesQuery,
  useAgentToolsQuery,
  useStatsQuery,
} from './queries';

// Re-export query factories (for imperative fetching in commands)
export { agentQueries } from './queryFactories';

// Re-export components
export { Button, Pill, AutoSelectModal } from './components';
export type { AutoSelectItem } from './components';

// Re-export context hooks
export {
  // SDK access
  useSDK,
  
  // Agent management
  useAgents,
  useAgent,
  
  // Workspace management
  useWorkspaces,
  useWorkspace,
  
  // Conversation management
  useConversations,
  useConversation,
  useConversationMessages,
  
  // Chat operations
  useCreateChatSession,
  useOpenConversation,
  useSendMessage,
  useActiveChatActions,
  useActiveChatState,
  
  // Models
  useModels,
  useAvailableModels,
  
  // Configuration
  useApiBase,
  useConfig,
  useAuth,
  
  // Navigation
  useNavigation,
  useDockState,
  
  // Toast notifications
  useToast,
  
  // Notifications
  useNotifications,
  
  // Slash commands
  useSlashCommandHandler,
  useSlashCommands,
  
  // Tool approval
  useToolApproval,
  
  // Statistics
  useStats,
  useConversationStats,
  
  // Keyboard shortcuts
  useKeyboardShortcut,
  useKeyboardShortcuts,
  
  // Workflows
  useWorkflows,
  useWorkflowFiles,
  
  // Chat utilities
  useSendToChat,
} from './hooks';

// Re-export utility functions
export {
  createChatSession,
  sendMessage,
  streamMessage,
  invokeAgent,
  invoke,
  transformTool,
  fetchConfig,
  _setWorkspaceContext,
  _setApiBase,
} from './api';

export type { InvokeOptions } from './api';

export {
  resolveAgentName,
  parseAgentSlug,
  isWorkspaceAgent,
} from './agentResolver';

// Re-export components
export {
  SDKProvider,
  WorkspaceProvider,
  WorkspaceNavigationProvider,
  useWorkspaceNavigation,
  SDKContext,
} from './providers';

// Re-export workspace utilities
export { createWorkspaceContext } from './workspace/context';

// Re-export workspace provider hooks (delegates to core app)
export {
  registerProvider,
  configureProvider,
  getProvider,
  hasProvider,
  getActiveProviderId,
  _setProviderFunctions,
} from './workspaceProviders';

export type { ProviderMetadata } from './workspaceProviders';
