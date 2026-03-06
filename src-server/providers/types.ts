/**
 * Provider interfaces for pluggable auth, user identity, user directory,
 * and package registries (agents, tools/MCP servers).
 *
 * Data types are canonical in @stallion-ai/shared.
 * This file adds the provider *interfaces* that plugins implement.
 */

import type { ToolDef } from '../domain/types.js';
import type { AppConfig } from '../domain/types.js';

// Re-export data types from shared so existing server imports still work
export type {
  RegistryItem,
  InstallResult,
  AuthStatus,
  RenewResult,
  UserIdentity,
  UserDetailVM,
  Prerequisite,
} from '@stallion-ai/shared';

import type {
  RegistryItem,
  InstallResult,
  AuthStatus,
  RenewResult,
  UserIdentity,
  UserDetailVM,
  Prerequisite,
} from '@stallion-ai/shared';

// ── Provider Interfaces (server-only, not in shared) ───

export interface IAgentRegistryProvider {
  listAvailable(): Promise<RegistryItem[]>;
  listInstalled(): Promise<RegistryItem[]>;
  install(id: string): Promise<InstallResult>;
  uninstall(id: string): Promise<InstallResult>;
}

export interface IToolRegistryProvider {
  listAvailable(): Promise<RegistryItem[]>;
  listInstalled(): Promise<RegistryItem[]>;
  install(id: string): Promise<InstallResult>;
  uninstall(id: string): Promise<InstallResult>;
  getToolDef(id: string): Promise<ToolDef | null>;
  sync(): Promise<void>;
}

export interface IAuthProvider {
  getStatus(): Promise<AuthStatus>;
  renew(): Promise<RenewResult>;
  getBadgePhoto?(id: string): Promise<ArrayBuffer | null>;
}

export interface IUserIdentityProvider {
  getIdentity(): Promise<UserIdentity>;
  enrichIdentity?(user: UserIdentity): Promise<UserIdentity>;
}

export interface IUserDirectoryProvider {
  lookupPerson(alias: string): Promise<UserDetailVM>;
  searchPeople(query: string): Promise<UserDetailVM[]>;
}

export interface IOnboardingProvider {
  getPrerequisites(): Promise<Prerequisite[]>;
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

export type SchedulerCapability = 'artifacts' | 'notifications' | 'daemon' | 'working-dir' | 'command';

export interface SchedulerFormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'boolean';
  placeholder?: string;
  hint?: string;
}

export interface SchedulerJob {
  name: string;
  provider: string;
  cron?: string;
  prompt: string;
  agent?: string;
  enabled: boolean;
  openArtifact?: string;
  notifyStart?: boolean;
  lastRun?: string;
  nextRun?: string;
  [key: string]: unknown;
}

export interface SchedulerLogEntry {
  id: string;
  job: string;
  startedAt: string;
  completedAt?: string;
  success: boolean;
  durationSecs?: number;
  missedCount?: number;
  output?: string;
  error?: string;
}

export interface AddJobOpts {
  name: string;
  provider?: string;
  cron?: string;
  prompt: string;
  agent?: string;
  openArtifact?: string;
  notifyStart?: boolean;
  [key: string]: unknown;
}

export interface SchedulerProviderStats {
  jobs: { name: string; total: number; successes: number; failures: number; success_rate: number }[];
}

export interface SchedulerProviderStatus {
  running: boolean;
  jobCount: number;
}

export interface ISchedulerProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: SchedulerCapability[];
  getFormFields?(): SchedulerFormField[];

  listJobs(): Promise<SchedulerJob[]>;
  addJob(opts: AddJobOpts): Promise<string>;
  editJob(target: string, opts: Record<string, string | boolean>): Promise<string>;
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
}

// ── ACP Connections Provider ───────────────────────────

import type { ACPConnectionConfig } from '../domain/types.js';

export interface IACPConnectionsProvider {
  getConnections(): ACPConnectionConfig[];
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
  toolRegistry: 'additive',
  onboarding: 'additive',
  acpConnections: 'additive',
};
