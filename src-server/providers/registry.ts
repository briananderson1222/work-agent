/**
 * Provider registry — register/get pattern with lazy default fallback
 */

import type { IAuthProvider, IUserIdentityProvider, IUserDirectoryProvider, IAgentRegistryProvider, IToolRegistryProvider } from './types.js';
import {
  DefaultAuthProvider, DefaultUserIdentityProvider, DefaultUserDirectoryProvider,
  DefaultAgentRegistryProvider, DefaultToolRegistryProvider,
} from './defaults.js';

let authProvider: IAuthProvider | null = null;
let userIdentityProvider: IUserIdentityProvider | null = null;
let userDirectoryProvider: IUserDirectoryProvider | null = null;
let agentRegistryProvider: IAgentRegistryProvider | null = null;
let toolRegistryProvider: IToolRegistryProvider | null = null;

// ── Auth ───────────────────────────────────────────────

export function registerAuthProvider(provider: IAuthProvider) {
  authProvider = provider;
}

export function getAuthProvider(): IAuthProvider {
  return authProvider ?? (authProvider = new DefaultAuthProvider());
}

// ── User Identity ──────────────────────────────────────

export function registerUserIdentityProvider(provider: IUserIdentityProvider) {
  userIdentityProvider = provider;
}

export function getUserIdentityProvider(): IUserIdentityProvider {
  return userIdentityProvider ?? (userIdentityProvider = new DefaultUserIdentityProvider());
}

// ── User Directory ─────────────────────────────────────

export function registerUserDirectoryProvider(provider: IUserDirectoryProvider) {
  userDirectoryProvider = provider;
}

export function getUserDirectoryProvider(): IUserDirectoryProvider {
  return userDirectoryProvider ?? (userDirectoryProvider = new DefaultUserDirectoryProvider());
}

// ── Agent Registry ─────────────────────────────────────

export function registerAgentRegistryProvider(provider: IAgentRegistryProvider) {
  agentRegistryProvider = provider;
}

export function getAgentRegistryProvider(): IAgentRegistryProvider {
  return agentRegistryProvider ?? (agentRegistryProvider = new DefaultAgentRegistryProvider());
}

// ── Tool Registry ──────────────────────────────────────

export function registerToolRegistryProvider(provider: IToolRegistryProvider) {
  toolRegistryProvider = provider;
}

export function getToolRegistryProvider(): IToolRegistryProvider {
  return toolRegistryProvider ?? (toolRegistryProvider = new DefaultToolRegistryProvider());
}

// ── Onboarding ─────────────────────────────────────────

import type { IOnboardingProvider } from './types.js';

const onboardingProviders: IOnboardingProvider[] = [];

export function registerOnboardingProvider(provider: IOnboardingProvider): void {
  onboardingProviders.push(provider);
}

export function getOnboardingProviders(): IOnboardingProvider[] {
  return onboardingProviders;
}
