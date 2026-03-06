// Re-export all types

// Core utilities
export { ListenerManager, noopSubscribe } from './core/ListenerManager.js';

// Voice + context provider interfaces and registries
export type {
  ConversationalOptions,
  ConversationalSessionState,
  ConversationalVoiceProvider,
  ProviderCapability,
  STTOptions,
  STTProvider,
  STTState,
  TTSOptions,
  TTSProvider,
  VisibleOn,
} from './voice/types.js';
export { voiceRegistry } from './voice/registry.js';
export type {
  ContextCapability,
  MessageContextProvider,
} from './context/types.js';
export { contextRegistry } from './context/registry.js';

// Re-export useQueryClient for contexts that need access to cache
export { useQueryClient } from '@tanstack/react-query';
export {
  isWorkspaceAgent,
  parseAgentSlug,
  resolveAgentName,
} from './agentResolver';
export type { InvokeOptions } from './api';
// Re-export utility functions
export {
  _setApiBase,
  _setWorkspaceContext,
  callTool,
  createChatSession,
  fetchConfig,
  invoke,
  invokeAgent,
  sendMessage,
  streamMessage,
  transformTool,
} from './api';
export type { AutoSelectItem } from './components';
// Re-export components
export {
  AutoSelectModal,
  Button,
  FullScreenLoader,
  LoadingState,
  Pill,
  Spinner,
} from './components';

// Re-export context hooks
export {
  useActiveChatActions,
  useActiveChatState,
  useAgent,
  // Agent management
  useAgents,
  // Configuration
  useApiBase,
  useAuth,
  useAvailableModels,
  useConfig,
  useConversation,
  useConversationMessages,
  useConversationStats,
  // Conversation management
  useConversations,
  // Chat operations
  useCreateChatSession,
  useDockState,
  // Keyboard shortcuts
  useKeyboardShortcut,
  useKeyboardShortcuts,
  // Models
  useModels,
  // Navigation
  useNavigation,
  // Notifications
  useNotifications,
  useOpenConversation,
  // SDK access
  useSDK,
  useSendMessage,
  // Chat utilities
  useSendToChat,
  // Server-side fetch proxy
  useServerFetch,
  // Slash commands
  useSlashCommandHandler,
  useSlashCommands,
  // Statistics
  useStats,
  // Toast notifications
  useToast,
  // Tool approval
  useToolApproval,
  // User directory
  useUserLookup,
  useWorkflowFiles,
  // Workflows
  useWorkflows,
  useWorkspace,
  // Workspace management
  useWorkspaces,
} from './hooks';
// Re-export components
export {
  SDKContext,
  SDKProvider,
  useWorkspaceNavigation,
  WorkspaceNavigationProvider,
  WorkspaceProvider,
} from './providers';
// Re-export query hooks (plugins use these instead of raw React Query)
export {
  useAchievementsQuery,
  useAgentsQuery,
  useAgentToolsQuery,
  useApiMutation,
  useApiQuery,
  useConfigQuery,
  useConversationsQuery,
  useInvalidateQuery,
  useInvokeAgent,
  useModelCapabilitiesQuery,
  useModelsQuery,
  useStatsQuery,
  useTransformTool,
  useUsageQuery,
  useWorkspaceQuery,
  useWorkspacesQuery,
} from './queries';
// Re-export query factories (for imperative fetching in commands)
export { agentQueries } from './queryFactories';
export * from './types';

// Re-export workspace utilities
export { createWorkspaceContext } from './workspace/context';
export type { ProviderMetadata } from './workspaceProviders';
// Re-export workspace provider hooks (delegates to core app)
export {
  _setProviderFunctions,
  configureProvider,
  getActiveProviderId,
  getProvider,
  hasProvider,
  registerProvider,
} from './workspaceProviders';
