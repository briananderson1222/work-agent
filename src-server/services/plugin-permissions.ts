/**
 * Plugin Permission System
 *
 * Three tiers: passive (auto-grant), active (prompt), trusted (prompt + warning).
 * Grants persisted in plugin-grants.json keyed by plugin name.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

function grantsPath(projectHomeDir: string): string {
  return join(projectHomeDir, 'plugin-grants.json');
}

function readGrants(projectHomeDir: string): GrantsFile {
  const p = grantsPath(projectHomeDir);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

function writeGrants(projectHomeDir: string, grants: GrantsFile): void {
  mkdirSync(projectHomeDir, { recursive: true });
  writeFileSync(grantsPath(projectHomeDir), JSON.stringify(grants, null, 2));
}

export function getPluginGrants(
  projectHomeDir: string,
  pluginName: string,
): string[] {
  return readGrants(projectHomeDir)[pluginName] || [];
}

export function grantPermissions(
  projectHomeDir: string,
  pluginName: string,
  permissions: string[],
): void {
  const grants = readGrants(projectHomeDir);
  const existing = new Set(grants[pluginName] || []);
  for (const p of permissions) existing.add(p);
  grants[pluginName] = [...existing];
  writeGrants(projectHomeDir, grants);
}

export function revokeAllGrants(
  projectHomeDir: string,
  pluginName: string,
): void {
  const grants = readGrants(projectHomeDir);
  delete grants[pluginName];
  writeGrants(projectHomeDir, grants);
}

export function hasGrant(
  projectHomeDir: string,
  pluginName: string,
  permission: string,
): boolean {
  return getPluginGrants(projectHomeDir, pluginName).includes(permission);
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
  projectHomeDir: string,
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
    grantPermissions(projectHomeDir, pluginName, autoGranted);
  }

  return { autoGranted, pendingConsent };
}
