export * from './runtime-events.js';

export type {
  ACPConfig,
  ACPConnectionConfig,
  ACPStatusValue,
} from '@stallion-ai/contracts/acp';
export { ACPStatus } from '@stallion-ai/contracts/acp';

export type {
  Notification,
  NotificationAction,
  NotificationPriority,
  NotificationStatus,
  ScheduleNotificationOpts,
} from '@stallion-ai/contracts/notification';

export type {
  AddJobOpts,
  SchedulerCapability,
  SchedulerEvent,
  SchedulerFormField,
  SchedulerJob,
  SchedulerLogEntry,
  SchedulerProviderStats,
  SchedulerProviderStatus,
} from '@stallion-ai/contracts/scheduler';

export type {
  AgentExecutionConfig,
  AgentGuardrails,
  AgentMetadata,
  AgentQuickPrompt,
  AgentSpec,
  AgentTools,
  AgentUIConfig,
  SlashCommand,
  SlashCommandParam,
} from '@stallion-ai/contracts/agent';

export type {
  AuthStatus,
  RenewResult,
  UserDetailVM,
  UserIdentity,
} from '@stallion-ai/contracts/auth';

export type {
  AppConfig,
  TemplateVariable,
} from '@stallion-ai/contracts/config';

export type {
  InstallResult,
  Playbook,
  Prompt,
  RegistryItem,
  Skill,
} from '@stallion-ai/contracts/catalog';

export type {
  KnowledgeDocumentMeta,
  KnowledgeNamespaceBehavior,
  KnowledgeNamespaceConfig,
  KnowledgeSearchFilter,
  KnowledgeTreeNode,
} from '@stallion-ai/contracts/knowledge';
export { BUILTIN_KNOWLEDGE_NAMESPACES } from '@stallion-ai/contracts/knowledge';

export type {
  LayoutAction,
  LayoutConfig,
  LayoutMetadata,
  LayoutPrompt,
  LayoutTab,
  LayoutTemplate,
  LayoutDefinition,
  LayoutDefinitionMetadata,
} from '@stallion-ai/contracts/layout';

export type {
  ConflictInfo,
  PluginComponent,
  PluginDependency,
  PluginManifest,
  PluginOverrideConfig,
  PluginOverrides,
  PluginPreview,
  PluginProviderEntry,
  PluginSettingField,
} from '@stallion-ai/contracts/plugin';

export type {
  ProjectConfig,
  ProjectMetadata,
} from '@stallion-ai/contracts/project';

export type {
  AgentInvokeResponse,
  AgentSwitchState,
  ConversationStats,
  MemoryEvent,
  SessionMetadata,
  ToolCallResponse,
  WorkflowMetadata,
} from '@stallion-ai/contracts/runtime';

export type {
  ConnectionCapability,
  ConnectionConfig,
  ConnectionKind,
  ConnectionStatus,
  Prerequisite,
  ProviderConnectionConfig,
  RuntimeConnectionSettings,
  ToolDef,
  ToolMetadata,
  ToolPermissions,
} from '@stallion-ai/contracts/tool';

// ── Plugin Preview / Validation ────────────────────────────────────
