import type { ACPConnectionConfig } from '@stallion-ai/contracts/acp';
import type {
  AuthStatus,
  RenewResult,
  UserDetailVM,
  UserIdentity,
} from '@stallion-ai/contracts/auth';
import type {
  InstallResult,
  Prompt,
  RegistryItem,
} from '@stallion-ai/contracts/catalog';
import type { AppConfig } from '@stallion-ai/contracts/config';
import type { ScheduleNotificationOpts } from '@stallion-ai/contracts/notification';
import type { PluginPreview } from '@stallion-ai/contracts/plugin';
import type { ProviderKind } from '@stallion-ai/contracts/provider';
import type {
  AddJobOpts,
  SchedulerCapability,
  SchedulerFormField,
  SchedulerJob,
  SchedulerLogEntry,
  SchedulerProviderStats,
  SchedulerProviderStatus,
} from '@stallion-ai/contracts/scheduler';
import type { Prerequisite, ToolDef } from '@stallion-ai/contracts/tool';
import type { ProviderAdapterShape } from './adapter-shape.js';

export interface IAgentRegistryProvider {
  listAvailable(): Promise<RegistryItem[]>;
  listInstalled(): Promise<RegistryItem[]>;
  install(id: string): Promise<InstallResult>;
  uninstall(id: string): Promise<InstallResult>;
  update?(id: string): Promise<InstallResult>;
}

export interface IIntegrationRegistryProvider {
  listAvailable(): Promise<RegistryItem[]>;
  listInstalled(): Promise<RegistryItem[]>;
  install(id: string): Promise<InstallResult>;
  uninstall(id: string): Promise<InstallResult>;
  getToolDef(id: string): Promise<ToolDef | null>;
  sync(): Promise<void>;
  installByCommand?(command: string): Promise<InstallResult>;
  update?(id: string): Promise<InstallResult>;
}

export interface ISkillRegistryProvider {
  listAvailable(): Promise<RegistryItem[]>;
  listInstalled(): Promise<RegistryItem[]>;
  install(id: string, targetDir: string): Promise<InstallResult>;
  uninstall(id: string, targetDir: string): Promise<InstallResult>;
  update?(id: string): Promise<InstallResult>;
  getContent?(id: string): Promise<string | null>;
}

export interface IPluginRegistryProvider {
  listAvailable(): Promise<RegistryItem[]>;
  listInstalled(): Promise<RegistryItem[]>;
  install(id: string): Promise<InstallResult>;
  uninstall(id: string): Promise<InstallResult>;
  preview?(id: string): Promise<PluginPreview>;
  update?(id: string): Promise<InstallResult>;
}

export interface IAuthProvider {
  getStatus(): Promise<AuthStatus>;
  renew(): Promise<RenewResult>;
  getBadgePhoto?(id: string): Promise<ArrayBuffer | null>;
  getPrerequisites?(): Promise<Prerequisite[]>;
}

export interface IUserIdentityProvider {
  getIdentity(): Promise<UserIdentity>;
  enrichIdentity?(user: UserIdentity): Promise<UserIdentity>;
}

export interface IUserDirectoryProvider {
  lookupPerson(alias: string): Promise<UserDetailVM>;
  searchPeople(query: string): Promise<UserDetailVM[]>;
}

export interface IBrandingProvider {
  getAppName(): Promise<string>;
  getLogo?(): Promise<{ src: string; alt?: string } | null>;
  getTheme?(): Promise<Record<string, string> | null>;
  getWelcomeMessage?(): Promise<string | null>;
}

export interface ISettingsProvider {
  getDefaults(): Promise<Partial<AppConfig>>;
}

export interface ISchedulerProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: SchedulerCapability[];
  getFormFields?(): SchedulerFormField[];
  listJobs(): Promise<SchedulerJob[]>;
  addJob(opts: AddJobOpts): Promise<string>;
  editJob(
    target: string,
    opts: Record<string, string | boolean>,
  ): Promise<string>;
  removeJob(target: string): Promise<void>;
  runJob(target: string): Promise<string>;
  enableJob(target: string): Promise<void>;
  disableJob(target: string): Promise<void>;
  getJobLogs(target: string, count?: number): Promise<SchedulerLogEntry[]>;
  readRunFile?(path: string): Promise<string>;
  getStats(): Promise<SchedulerProviderStats>;
  getStatus(): Promise<SchedulerProviderStatus>;
  previewSchedule?(cron: string, count?: number): Promise<string[]>;
  subscribe?(send: (data: string) => void): () => void;
  getPrerequisites?(): Promise<Prerequisite[]>;
}

export interface INotificationProvider {
  readonly id: string;
  readonly displayName: string;
  readonly categories: string[];
  poll?(): Promise<ScheduleNotificationOpts[]>;
  handleAction?(notificationId: string, actionId: string): Promise<void>;
  handleDismiss?(notificationId: string): Promise<void>;
}

export interface ILayoutTypeProvider {
  readonly id: string;
  readonly displayName: string;
  readonly icon: string;
  getConfigSchema?(): unknown;
  getDefaultConfig(): Record<string, unknown>;
}

export interface IACPConnectionsProvider {
  getConnections(): ACPConnectionConfig[];
}

export interface IPromptRegistryProvider {
  readonly id: string;
  readonly displayName: string;
  listPrompts(): Promise<Prompt[]>;
  getPrompt(id: string): Promise<Prompt | null>;
}

export interface Template {
  id: string;
  icon: string;
  label: string;
  description: string;
  type: 'agent' | 'layout';
  form: Record<string, any>;
  tabs?: Array<{ id: string; label: string; component: string }>;
  source?: string;
}

export interface ITemplateProvider {
  readonly id: string;
  readonly displayName: string;
  listTemplates(): Promise<Template[]>;
}

export interface IProviderAdapterRegistry {
  register(adapter: ProviderAdapterShape): void;
  get(provider: ProviderKind): ProviderAdapterShape | undefined;
  list(): ProviderAdapterShape[];
}

export type ProviderCardinality = 'singleton' | 'additive';

export const PROVIDER_TYPE_META: Record<string, ProviderCardinality> = {
  auth: 'singleton',
  userIdentity: 'singleton',
  userDirectory: 'singleton',
  branding: 'singleton',
  settings: 'singleton',
  scheduler: 'additive',
  agentRegistry: 'additive',
  integrationRegistry: 'additive',
  pluginRegistry: 'additive',
  acpConnections: 'additive',
  llmProvider: 'additive',
  embeddingProvider: 'additive',
  vectorDbProvider: 'additive',
  layoutType: 'additive',
  notification: 'additive',
  skillRegistry: 'additive',
  providerAdapter: 'additive',
};
