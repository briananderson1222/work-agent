import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RegistryItem } from '@stallion-ai/contracts/catalog';
import { resolveHomeDir } from '../utils/paths.js';
import type { IIntegrationRegistryProvider } from './provider-interfaces.js';

export function readDiskIntegrations(
  homeDir = resolveHomeDir(),
): RegistryItem[] {
  const dir = join(homeDir, 'integrations');
  if (!existsSync(dir)) return [];
  const items: RegistryItem[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const defPath = join(dir, entry.name, 'integration.json');
    if (!existsSync(defPath)) continue;
    try {
      const def = JSON.parse(readFileSync(defPath, 'utf-8'));
      let commandExists = false;
      if (def.command) {
        try {
          const cmd =
            process.platform === 'win32'
              ? `where ${def.command}`
              : `which ${def.command}`;
          execSync(cmd, { stdio: 'pipe', windowsHide: true });
          commandExists = true;
        } catch (error) {
          console.debug('Command not found for integration:', def.command, error);
        }
      }
      items.push({
        id: def.id || entry.name,
        displayName: def.displayName || entry.name,
        description: def.description || '',
        installed: true,
        status: commandExists ? 'connected' : 'missing binary',
      });
    } catch (error) {
      console.debug('Failed to read integration definition:', entry.name, error);
    }
  }
  return items;
}

export function mergeRegistryItems(
  diskItems: RegistryItem[],
  providerItems: RegistryItem[],
): RegistryItem[] {
  const seen = new Set<string>();
  const merged: RegistryItem[] = [];
  for (const item of diskItems) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  for (const item of providerItems) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

export function createIntegrationRegistryProvider(
  providers: IIntegrationRegistryProvider[],
  homeDir = resolveHomeDir(),
): IIntegrationRegistryProvider {
  return {
    async listAvailable() {
      const results = await Promise.all(
        providers.map((provider) => provider.listAvailable()),
      );
      return mergeRegistryItems(readDiskIntegrations(homeDir), results.flat());
    },
    async listInstalled() {
      const results = await Promise.all(
        providers.map((provider) => provider.listInstalled()),
      );
      return mergeRegistryItems(readDiskIntegrations(homeDir), results.flat());
    },
    async install(id) {
      for (const provider of providers) {
        const result = await provider.install(id);
        if (result.success) return result;
      }
      return { success: false, message: `No provider could install ${id}` };
    },
    async uninstall(id) {
      for (const provider of providers) {
        const result = await provider.uninstall(id);
        if (result.success) return result;
      }
      return { success: false, message: `No provider could uninstall ${id}` };
    },
    async getToolDef(id) {
      for (const provider of providers) {
        const def = await provider.getToolDef(id);
        if (def) return def;
      }
      return null;
    },
    async sync() {
      await Promise.all(providers.map((provider) => provider.sync()));
    },
    async installByCommand(command) {
      for (const provider of providers) {
        if (provider.installByCommand) {
          const result = await provider.installByCommand(command);
          if (result.success) return result;
        }
      }
      return {
        success: false,
        message: `No provider could install command ${command}`,
      };
    },
  };
}
