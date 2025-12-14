// Re-export all types
export * from './types';

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
} from './queries';

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
  useSendMessage,
  useActiveChatActions,
  useActiveChatState,
  
  // Models
  useModels,
  useAvailableModels,
  
  // Configuration
  useApiBase,
  useConfig,
  
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
