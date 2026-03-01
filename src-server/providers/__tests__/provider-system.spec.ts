import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolvePluginProviders } from '../resolver.js';
import {
  registerProvider,
  getProvider,
  listProviders,
  clearAll,
  registerBrandingProvider,
  getBrandingProvider,
} from '../registry.js';
import { ConfigLoader } from '../../domain/config-loader.js';

describe('Provider System', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'provider-test-'));
    clearAll();
  });

  afterAll(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('resolver.ts', () => {
    it('returns empty resolved and no conflicts for empty plugins dir', () => {
      const result = resolvePluginProviders(join(tempDir, 'nonexistent'), {});
      expect(result.resolved).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });

    it('resolves single plugin with one provider correctly', () => {
      const pluginsDir = join(tempDir, 'plugins');
      const pluginDir = join(pluginsDir, 'test-plugin');
      mkdirSync(pluginDir, { recursive: true });
      
      writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify({
        name: 'test-plugin',
        providers: [{ type: 'auth', module: './auth.js' }]
      }));

      const result = resolvePluginProviders(pluginsDir, {});
      expect(result.resolved).toHaveLength(1);
      expect(result.resolved[0]).toEqual({
        pluginName: 'test-plugin',
        type: 'auth',
        module: './auth.js',
        workspace: undefined
      });
      expect(result.conflicts).toEqual([]);
    });

    it('filters out disabled provider', () => {
      const pluginsDir = join(tempDir, 'plugins');
      const pluginDir = join(pluginsDir, 'test-plugin');
      mkdirSync(pluginDir, { recursive: true });
      
      writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify({
        name: 'test-plugin',
        providers: [{ type: 'auth', module: './auth.js' }]
      }));

      const overrides = { 'test-plugin': { disabled: ['auth'] } };
      const result = resolvePluginProviders(pluginsDir, overrides);
      expect(result.resolved).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });

    it('creates conflict for two plugins providing same singleton type', () => {
      const pluginsDir = join(tempDir, 'plugins');
      
      const plugin1Dir = join(pluginsDir, 'plugin1');
      mkdirSync(plugin1Dir, { recursive: true });
      writeFileSync(join(plugin1Dir, 'plugin.json'), JSON.stringify({
        name: 'plugin1',
        providers: [{ type: 'auth', module: './auth.js' }]
      }));

      const plugin2Dir = join(pluginsDir, 'plugin2');
      mkdirSync(plugin2Dir, { recursive: true });
      writeFileSync(join(plugin2Dir, 'plugin.json'), JSON.stringify({
        name: 'plugin2',
        providers: [{ type: 'auth', module: './auth.js' }]
      }));

      const result = resolvePluginProviders(pluginsDir, {});
      expect(result.resolved).toEqual([]);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toEqual({
        type: 'auth',
        workspace: '*',
        candidates: ['plugin1', 'plugin2']
      });
    });

    it('resolves two plugins providing same additive type without conflict', () => {
      const pluginsDir = join(tempDir, 'plugins');
      
      const plugin1Dir = join(pluginsDir, 'plugin1');
      mkdirSync(plugin1Dir, { recursive: true });
      writeFileSync(join(plugin1Dir, 'plugin.json'), JSON.stringify({
        name: 'plugin1',
        providers: [{ type: 'onboarding', module: './onboarding.js' }]
      }));

      const plugin2Dir = join(pluginsDir, 'plugin2');
      mkdirSync(plugin2Dir, { recursive: true });
      writeFileSync(join(plugin2Dir, 'plugin.json'), JSON.stringify({
        name: 'plugin2',
        providers: [{ type: 'onboarding', module: './onboarding.js' }]
      }));

      const result = resolvePluginProviders(pluginsDir, {});
      expect(result.resolved).toHaveLength(2);
      expect(result.conflicts).toEqual([]);
    });

    it('skips plugin with no providers array', () => {
      const pluginsDir = join(tempDir, 'plugins');
      const pluginDir = join(pluginsDir, 'test-plugin');
      mkdirSync(pluginDir, { recursive: true });
      
      writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify({
        name: 'test-plugin'
      }));

      const result = resolvePluginProviders(pluginsDir, {});
      expect(result.resolved).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });
  });

  describe('registry.ts', () => {
    it('registerProvider + getProvider round-trip for singleton type', () => {
      const mockProvider = { test: 'value' };
      registerProvider('auth', mockProvider);
      
      const retrieved = getProvider('auth');
      expect(retrieved).toBe(mockProvider);
    });

    it('getProvider returns null when nothing registered', () => {
      const result = getProvider('auth');
      expect(result).toBeNull();
    });

    it('getProvider with workspace scoping', () => {
      const globalProvider = { scope: 'global' };
      const workspaceProvider = { scope: 'workspace' };
      
      registerProvider('auth', globalProvider);
      registerProvider('auth', workspaceProvider, { workspace: 'test-ws' });
      
      expect(getProvider('auth')).toBe(globalProvider);
      expect(getProvider('auth', 'test-ws')).toBe(workspaceProvider);
      expect(getProvider('auth', 'other-ws')).toBe(globalProvider);
    });

    it('listProviders returns all entries for additive types', () => {
      const provider1 = { id: 1 };
      const provider2 = { id: 2 };
      
      registerProvider('onboarding', provider1, { source: 'plugin1' });
      registerProvider('onboarding', provider2, { source: 'plugin2' });
      
      const entries = listProviders('onboarding');
      expect(entries).toHaveLength(2);
      expect(entries[0].provider).toBe(provider1);
      expect(entries[1].provider).toBe(provider2);
    });

    it('clearAll resets both stores', () => {
      registerProvider('auth', { test: 'singleton' });
      registerProvider('onboarding', { test: 'additive' });
      
      expect(getProvider('auth')).not.toBeNull();
      expect(listProviders('onboarding')).toHaveLength(1);
      
      clearAll();
      
      expect(getProvider('auth')).toBeNull();
      expect(listProviders('onboarding')).toHaveLength(0);
    });

    it('backward-compat: registerBrandingProvider + getBrandingProvider', () => {
      const mockBranding = { getAppName: () => Promise.resolve('Test App') };
      registerBrandingProvider(mockBranding);
      
      const retrieved = getBrandingProvider();
      expect(retrieved).toBe(mockBranding);
    });

    it('getBrandingProvider returns DefaultBrandingProvider when nothing registered', () => {
      const defaultBranding = getBrandingProvider();
      expect(defaultBranding).toBeDefined();
      expect(typeof defaultBranding.getAppName).toBe('function');
    });
  });

  describe('ConfigLoader override tests', () => {
    let configLoader: ConfigLoader;
    let workAgentDir: string;

    beforeEach(() => {
      workAgentDir = join(tempDir, 'work-agent');
      configLoader = new ConfigLoader({ workAgentDir });
    });

    it('loadPluginOverrides returns {} when file does not exist', async () => {
      const overrides = await configLoader.loadPluginOverrides();
      expect(overrides).toEqual({});
    });

    it('savePluginOverrides + loadPluginOverrides round-trip', async () => {
      const testOverrides = {
        'plugin1': { disabled: ['auth', 'branding'] },
        'plugin2': { disabled: ['onboarding'] }
      };
      
      await configLoader.savePluginOverrides(testOverrides);
      const loaded = await configLoader.loadPluginOverrides();
      
      expect(loaded).toEqual(testOverrides);
    });
  });
});