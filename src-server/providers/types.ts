/**
 * Provider interfaces for pluggable auth, user identity, user directory,
 * and package registries (agents, tools/MCP servers).
 */

import type { ToolDef } from '../domain/types.js';

// ── Package Registry Providers ─────────────────────────

export interface RegistryItem {
  id: string;
  displayName?: string;
  description?: string;
  version?: string;
  status?: string;
  installed: boolean;
}

export interface InstallResult {
  success: boolean;
  message: string;
}

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

// ── Auth Provider ──────────────────────────────────────

export interface AuthStatus {
  provider: string;
  status: 'valid' | 'expiring' | 'expired' | 'missing';
  expiresAt: string | null;
  message: string;
}

export interface RenewResult {
  success: boolean;
  message: string;
}

export interface IAuthProvider {
  getStatus(): Promise<AuthStatus>;
  renew(): Promise<RenewResult>;
  getBadgePhoto?(id: string): Promise<ArrayBuffer | null>;
}

// ── User Identity Provider ─────────────────────────────

export interface UserIdentity {
  alias: string;
  name?: string;
  title?: string;
  email?: string;
  profileUrl?: string;
}

export interface IUserIdentityProvider {
  getIdentity(): Promise<UserIdentity>;
  enrichIdentity?(user: UserIdentity): Promise<UserIdentity>;
}

// ── User Directory Provider ────────────────────────────

export interface UserDetailVM {
  alias: string;
  name: string;
  title?: string;
  team?: string;
  manager?: { alias: string; name?: string };
  email?: string;
  location?: string;
  avatarUrl?: string;
  profileUrl?: string;
  badges?: string[];
  tenure?: string;
  directReports?: number;
  extra?: Record<string, unknown>;
}

export interface IUserDirectoryProvider {
  lookupPerson(alias: string): Promise<UserDetailVM>;
  searchPeople(query: string): Promise<UserDetailVM[]>;
}

// ── Onboarding Provider ────────────────────────────────

export interface Prerequisite {
  id: string;
  name: string;
  description: string;
  status: 'installed' | 'missing' | 'error';
  category: 'required' | 'optional';
  installGuide?: {
    steps: string[];
    commands?: string[];
    links?: string[];
  };
}

export interface IOnboardingProvider {
  getPrerequisites(): Promise<Prerequisite[]>;
}
