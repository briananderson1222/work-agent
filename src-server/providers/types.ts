/**
 * Provider interfaces for pluggable auth, user identity, user directory,
 * and package registries (agents, tools/MCP servers).
 *
 * Data types are canonical in @stallion-ai/shared.
 * This file adds the provider *interfaces* that plugins implement.
 */

import type { AppConfig, ToolDef } from '../domain/types.js';

// Re-export data types from shared so existing server imports still work
export type {
  AuthStatus,
  InstallResult,
  Prerequisite,
  RegistryItem,
  RenewResult,
  UserDetailVM,
  UserIdentity,
} from '@stallion-ai/shared';

import type {
  AuthStatus,
  InstallResult,
  Prerequisite,
  RegistryItem,
  RenewResult,
  ScheduleNotificationOpts,
  UserDetailVM,
  UserIdentity,
} from '@stallion-ai/shared';

// ── Provider Interfaces (server-only, not in shared) ───

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
  preview?(id: string): Promise<import('@stallion-ai/shared').PluginPreview>;
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

// ── Scheduler Provider ─────────────────────────────────

// Data types are canonical in @stallion-ai/shared — re-export here for server imports
import type {
  AddJobOpts,
  SchedulerCapability,
  SchedulerFormField,
  SchedulerJob,
  SchedulerLogEntry,
  SchedulerProviderStats,
  SchedulerProviderStatus,
} from '@stallion-ai/shared';

export type {
  SchedulerCapability,
  SchedulerFormField,
  SchedulerJob,
  SchedulerLogEntry,
  AddJobOpts,
  SchedulerProviderStats,
  SchedulerProviderStatus,
};

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
  getRunOutput?(target: string): Promise<string>;
  readRunFile?(path: string): Promise<string>;
  getStats(): Promise<SchedulerProviderStats>;
  getStatus(): Promise<SchedulerProviderStatus>;
  previewSchedule?(cron: string, count?: number): Promise<string[]>;
  subscribe?(send: (data: string) => void): () => void;
  getPrerequisites?(): Promise<Prerequisite[]>;
}

// ── Notification Provider ──────────────────────────────

export interface INotificationProvider {
  readonly id: string;
  readonly displayName: string;
  readonly categories: string[];
  poll?(): Promise<ScheduleNotificationOpts[]>;
  handleAction?(notificationId: string, actionId: string): Promise<void>;
  handleDismiss?(notificationId: string): Promise<void>;
}

// ── LLM Provider ───────────────────────────────────────

export interface LLMModel {
  id: string;
  name: string;
  contextWindow?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: unknown }>;
}

export interface LLMStreamOpts {
  model: string;
  messages: LLMMessage[];
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LLMStreamChunk {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'finish' | 'error';
  content?: string;
  toolCall?: { id: string; name: string; arguments: unknown };
  toolResult?: { id: string; result: unknown };
  finishReason?: string;
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
}

export interface ILLMProvider {
  readonly id: string;
  readonly displayName: string;
  listModels(): Promise<LLMModel[]>;
  createStream(opts: LLMStreamOpts): AsyncIterable<LLMStreamChunk>;
  supportsStreaming?(): boolean;
  supportsToolCalling?(): boolean;
  healthCheck?(): Promise<boolean>;
  getPrerequisites?(): Promise<Prerequisite[]>;
}

// ── Embedding Provider ─────────────────────────────────

export interface IEmbeddingProvider {
  readonly id: string;
  readonly displayName: string;
  embed(texts: string[]): Promise<number[][]>;
  dimensions(): number;
  healthCheck?(): Promise<boolean>;
  getPrerequisites?(): Promise<Prerequisite[]>;
}

// ── Vector DB Provider ─────────────────────────────────

export interface VectorDocument {
  id: string;
  vector: number[];
  text: string;
  metadata: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface IVectorDbProvider {
  readonly id: string;
  readonly displayName: string;
  createNamespace(namespace: string): Promise<void>;
  deleteNamespace(namespace: string): Promise<void>;
  namespaceExists(namespace: string): Promise<boolean>;
  addDocuments(namespace: string, docs: VectorDocument[]): Promise<void>;
  deleteDocuments(namespace: string, docIds: string[]): Promise<void>;
  search(
    namespace: string,
    query: number[],
    topK: number,
    threshold?: number,
  ): Promise<VectorSearchResult[]>;
  getByMetadata(
    namespace: string,
    key: string,
    value: string,
  ): Promise<VectorSearchResult[]>;
  count(namespace: string): Promise<number>;
}

// ── Layout Type Provider ───────────────────────────────

export interface ILayoutTypeProvider {
  readonly id: string;
  readonly displayName: string;
  readonly icon: string;
  getConfigSchema?(): unknown;
  getDefaultConfig(): Record<string, unknown>;
}

// ── ACP Connections Provider ───────────────────────────

import type { ACPConnectionConfig } from '../domain/types.js';

export interface IACPConnectionsProvider {
  getConnections(): ACPConnectionConfig[];
}

// ── Prompt Registry ────────────────────────────────

export type { Prompt } from '@stallion-ai/shared';

import type { Prompt } from '@stallion-ai/shared';

export interface IPromptRegistryProvider {
  readonly id: string;
  readonly displayName: string;
  listPrompts(): Promise<Prompt[]>;
  getPrompt(id: string): Promise<Prompt | null>;
}

// ── Template Provider ──────────────────────────────────

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

// ── Provider Cardinality Metadata ──────────────────────

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
};
