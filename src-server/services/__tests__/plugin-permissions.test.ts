import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  getPermissionTier,
  getPluginGrants,
  grantPermissions,
  hasGrant,
  needsConsent,
  processInstallPermissions,
  revokeAllGrants,
} from '../plugin-permissions.js';

describe('permission tiers', () => {
  test('passive permissions', () => {
    expect(getPermissionTier('navigation.dock')).toBe('passive');
    expect(getPermissionTier('storage.read')).toBe('passive');
  });

  test('active permissions', () => {
    expect(getPermissionTier('network.fetch')).toBe('active');
    expect(getPermissionTier('storage.write')).toBe('active');
  });

  test('trusted permissions', () => {
    expect(getPermissionTier('system.config')).toBe('trusted');
  });

  test('unknown defaults to trusted', () => {
    expect(getPermissionTier('unknown.perm')).toBe('trusted');
  });

  test('needsConsent false for passive', () => {
    expect(needsConsent('navigation.dock')).toBe(false);
  });

  test('needsConsent true for active/trusted', () => {
    expect(needsConsent('network.fetch')).toBe(true);
    expect(needsConsent('system.config')).toBe(true);
  });
});

describe('grants storage', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'perm-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('getPluginGrants returns empty for unknown plugin', () => {
    expect(getPluginGrants(dir, 'unknown')).toEqual([]);
  });

  test('grantPermissions and hasGrant round-trip', () => {
    grantPermissions(dir, 'my-plugin', ['storage.read', 'network.fetch']);
    expect(hasGrant(dir, 'my-plugin', 'storage.read')).toBe(true);
    expect(hasGrant(dir, 'my-plugin', 'network.fetch')).toBe(true);
    expect(hasGrant(dir, 'my-plugin', 'system.config')).toBe(false);
  });

  test('grantPermissions is additive', () => {
    grantPermissions(dir, 'p', ['a']);
    grantPermissions(dir, 'p', ['b']);
    expect(getPluginGrants(dir, 'p')).toEqual(
      expect.arrayContaining(['a', 'b']),
    );
  });

  test('revokeAllGrants removes all', () => {
    grantPermissions(dir, 'p', ['a', 'b']);
    revokeAllGrants(dir, 'p');
    expect(getPluginGrants(dir, 'p')).toEqual([]);
  });
});

describe('processInstallPermissions', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'install-perm-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('auto-grants passive, returns active/trusted as pending', () => {
    const result = processInstallPermissions(dir, 'test-plugin', [
      'navigation.dock',
      'network.fetch',
      'system.config',
    ]);
    expect(result.autoGranted).toEqual(['navigation.dock']);
    expect(result.pendingConsent).toEqual([
      { permission: 'network.fetch', tier: 'active' },
      { permission: 'system.config', tier: 'trusted' },
    ]);
    expect(hasGrant(dir, 'test-plugin', 'navigation.dock')).toBe(true);
    expect(hasGrant(dir, 'test-plugin', 'network.fetch')).toBe(false);
  });
});
