// Re-export all types

// Re-export useQueryClient for contexts that need access to cache
export { useQueryClient } from '@tanstack/react-query';
export {
  isLayoutAgent,
  parseAgentSlug,
  resolveAgentName,
} from './agentResolver';
export type { InvokeOptions } from './api';
// Re-export utility functions
export {
  _setApiBase,
  _setLayoutContext,
  addProjectLayoutFromPlugin,
  bulkDeleteKnowledgeDocs,
  callTool,
  createChatSession,
  deleteKnowledgeDoc,
  fetchAvailableLayouts,
  fetchConfig,
  fetchKnowledgeDocContent,
  fetchKnowledgeDocs,
  fetchKnowledgeFiltered,
  fetchKnowledgeNamespaces,
  fetchKnowledgeStatus,
  fetchKnowledgeTree,
  fetchLayouts,
  fetchProjectConversations,
  invoke,
  invokeAgent,
  scanKnowledgeDirectory,
  searchKnowledge,
  sendMessage,
  streamMessage,
  updateKnowledgeDoc,
  updateKnowledgeNamespace,
  uploadKnowledge,
} from './api';
export type { AutoSelectItem } from './components';
// Re-export components
export {
  ActionButton,
  AuthStatusBadge,
  AutoSelectModal,
  Button,
  FullScreenError,
  FullScreenLoader,
  LayoutHeader,
  LoadingState,
  Pill,
  Spinner,
} from './components';
export { contextRegistry } from './context/registry.js';
export type {
  ContextCapability,
  MessageContextProvider,
} from './context/types.js';
// Core utilities
export { ListenerManager, noopSubscribe } from './core/ListenerManager.js';
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
  useKnowledgeDocs,
  useKnowledgeNamespaces,
  useKnowledgeSearch,
  // Chat utilities
  useLaunchChat,
  useLayout,
  // Layout management
  useLayouts,
  // Models
  useModels,
  // Navigation
  useNavigation,
  // Notifications
  useNotifications,
  useOpenConversation,
  useProject,
  // Project management
  useProjects,
  useResolveAgent,
  // SDK access
  useSDK,
  useSendMessage,
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
} from './hooks';
// Re-export layout utilities
export { createLayoutContext } from './layout/context';
export type { ProviderMetadata } from './layoutProviders';
// Re-export layout provider hooks (delegates to core app)
export {
  _setProviderFunctions,
  configureProvider,
  getActiveProviderId,
  getProvider,
  hasProvider,
  registerProvider,
} from './layoutProviders';
export { NotificationsAPI } from './notifications/index.js';
// Re-export components
export {
  LayoutNavigationProvider,
  LayoutProvider,
  SDKContext,
  SDKProvider,
  useLayoutNavigation,
} from './providers';
// Re-export query hooks (plugins use these instead of raw React Query)
export {
  useAchievementsQuery,
  useActivityUsageQuery,
  useAddJob,
  useAddLayoutFromPluginMutation,
  useAgentInvokeMutation,
  useAgentsQuery,
  useAgentToolsQuery,
  useApiMutation,
  useApiQuery,
  useConfigQuery,
  useConversationsQuery,
  useCreateLayoutMutation,
  useCreateProjectMutation,
  useDeleteJob,
  useDeleteProjectMutation,
  useEditJob,
  useFeedbackGuidelinesQuery,
  useFeedbackRatingsQuery,
  useFeedbackStatusQuery,
  useFetchRunOutput,
  useGitLogQuery,
  useGitStatusQuery,
  useInsightsQuery,
  useInstallRegistryItemMutation,
  useInstallSkillMutation,
  useInvalidateQuery,
  useInvokeAgent,
  useJobLogs,
  useKnowledgeBulkDeleteMutation,
  useKnowledgeDeleteMutation,
  useKnowledgeDocContentQuery,
  useKnowledgeDocsQuery,
  useKnowledgeFilteredQuery,
  useKnowledgeNamespacesQuery,
  useKnowledgeSaveMutation,
  useKnowledgeScanMutation,
  useKnowledgeSearchQuery,
  useKnowledgeStatusQuery,
  useKnowledgeTreeQuery,
  useKnowledgeUpdateMutation,
  useLayoutQuery,
  useLayoutsQuery,
  useModelCapabilitiesQuery,
  useModelsQuery,
  useOpenArtifact,
  usePlaybooksQuery,
  usePluginInstallMutation,
  usePluginPreviewMutation,
  usePluginProviderToggleMutation,
  usePluginRegistryInstallMutation,
  usePluginRemoveMutation,
  usePluginsQuery,
  usePluginUpdateMutation,
  usePluginUpdatesQuery,
  usePreviewSchedule,
  useProjectConversationsQuery,
  useProjectLayoutsQuery,
  useProjectQuery,
  useProjectsQuery,
  usePromptsQuery,
  useRegistryAgentsQuery,
  useRegistryInstalledQuery,
  useRegistryIntegrationsQuery,
  useRegistryPluginsQuery,
  useRegistrySkillsQuery,
  useRunJob,
  useSchedulerJobs,
  useSchedulerProviders,
  useSchedulerStats,
  useSchedulerStatus,
  useSkillContentQuery,
  useSkillsQuery,
  useStatsQuery,
  useToggleJob,
  useUninstallRegistryItemMutation,
  useUninstallSkillMutation,
  useUpdateProjectMutation,
  useUpdateSkillMutation,
  useUsageQuery,
  useUserQuery,
} from './queries';
// Re-export query factories (for imperative fetching in commands)
export { agentQueries, knowledgeQueries } from './queryFactories';
export { telemetry } from './telemetry';
export * from './types';
export { voiceRegistry } from './voice/registry.js';
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
