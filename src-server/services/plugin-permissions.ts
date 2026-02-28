/**
 * Plugin Permission System
 * 
 * Three tiers: passive (auto-grant), active (prompt), trusted (prompt + warning).
 * Grants persisted in plugin-grants.json keyed by plugin name.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── Permission Tiers ───────────────────────────────────

export type PermissionTier = 'passive' | 'active' | 'trusted';

const TIER_MAP: Record<string, PermissionTier> = {
  'navigation.dock': 'passive',
  'storage.read': 'passive',
  'network.fetch': 'active',
  'storage.write': 'active',
  'agents.invoke': 'active',
  'tools.invoke': 'active',
  'providers.register': 'trusted',
  'system.config': 'trusted',
};

export function getPermissionTier(permission: string): PermissionTier {
  return TIER_MAP[permission] || 'trusted';
}

export function needsConsent(permission: string): boolean {
  return getPermissionTier(permission) !== 'passive';
}

// ── Grants Storage ─────────────────────────────────────

interface GrantsFile {
  [pluginName: string]: string[];
}

function grantsPath(workAgentDir: string): string {
  return join(workAgentDir, 'plugin-grants.json');
}

function readGrants(workAgentDir: string): GrantsFile {
  const p = grantsPath(workAgentDir);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return {}; }
}

function writeGrants(workAgentDir: string, grants: GrantsFile): void {
  mkdirSync(workAgentDir, { recursive: true });
  writeFileSync(grantsPath(workAgentDir), JSON.stringify(grants, null, 2));
}

export function getPluginGrants(workAgentDir: string, pluginName: string): string[] {
  return readGrants(workAgentDir)[pluginName] || [];
}

export function grantPermissions(workAgentDir: string, pluginName: string, permissions: string[]): void {
  const grants = readGrants(workAgentDir);
  const existing = new Set(grants[pluginName] || []);
  for (const p of permissions) existing.add(p);
  grants[pluginName] = [...existing];
  writeGrants(workAgentDir, grants);
}

export function revokeAllGrants(workAgentDir: string, pluginName: string): void {
  const grants = readGrants(workAgentDir);
  delete grants[pluginName];
  writeGrants(workAgentDir, grants);
}

export function hasGrant(workAgentDir: string, pluginName: string, permission: string): boolean {
  return getPluginGrants(workAgentDir, pluginName).includes(permission);
}

// ── Install-time helpers ───────────────────────────────

export interface PermissionRequest {
  permission: string;
  tier: PermissionTier;
}

/**
 * Given a plugin's declared permissions, auto-grant passive ones
 * and return the list that needs user consent.
 */
export function processInstallPermissions(
  workAgentDir: string,
  pluginName: string,
  declaredPermissions: string[],
): { autoGranted: string[]; pendingConsent: PermissionRequest[] } {
  const autoGranted: string[] = [];
  const pendingConsent: PermissionRequest[] = [];

  for (const perm of declaredPermissions) {
    if (!needsConsent(perm)) {
      autoGranted.push(perm);
    } else {
      pendingConsent.push({ permission: perm, tier: getPermissionTier(perm) });
    }
  }

  // Auto-grant passive permissions immediately
  if (autoGranted.length > 0) {
    grantPermissions(workAgentDir, pluginName, autoGranted);
  }

  return { autoGranted, pendingConsent };
}
