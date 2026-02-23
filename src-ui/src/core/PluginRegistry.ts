/**
 * Plugin Registry - Auto-discovers and loads installed plugins
 * 
 * Scans workspaces/ and plugins/ directories for plugin.json manifests
 * and dynamically imports the components.
 */

import type { PluginManifest, WorkspaceComponent } from '@stallion-ai/sdk';
import { log } from '@/utils/logger';

interface RegisteredPlugin {
  manifest: PluginManifest;
  component: WorkspaceComponent;
  path: string;
}

export class PluginRegistry {
  private workspaces = new Map<string, RegisteredPlugin>();
  private components = new Map<string, RegisteredPlugin>();
  private initialized = false;

  /**
   * Initialize the registry by discovering all installed plugins
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Discover workspaces
    await this.discoverPlugins('/src/workspaces', 'workspace');

    // Discover components
    await this.discoverPlugins('/src/plugins', 'component');
  }

  /**
   * Discover plugins in a directory
   */
  private async discoverPlugins(baseDir: string, type: 'workspace' | 'component'): Promise<void> {
    try {
      // Use Vite's glob import to discover plugins at build time
      const modules = type === 'workspace'
        ? import.meta.glob('/src/workspaces/*/plugin.json')
        : import.meta.glob('/src/plugins/*/plugin.json');

      // Pre-load all entrypoint modules via glob so Vite can resolve them
      const entrypoints = type === 'workspace'
        ? import.meta.glob('/src/workspaces/*/index.{ts,tsx}')
        : import.meta.glob('/src/plugins/*/index.{ts,tsx}');

      for (const [path, loader] of Object.entries(modules)) {
        try {
          const manifest = await loader() as { default: PluginManifest };
          const pluginManifest = manifest.default;

          // Validate manifest
          if (!this.validateManifest(pluginManifest)) {
            log.plugin(`[PluginRegistry] Invalid manifest at ${path}`);
            continue;
          }

          // Load the component module via the pre-globbed entrypoints
          const componentPath = path.replace('/plugin.json', `/${pluginManifest.entrypoint}`);
          const entrypointLoader = entrypoints[componentPath];
          const module = entrypointLoader ? await entrypointLoader().catch((e: any) => { console.error(`[PluginRegistry] Import error for ${pluginManifest.name}:`, e); return null; }) : await this.loadComponentModule(componentPath);

          if (!module) {
            log.plugin(`[PluginRegistry] Failed to load component for ${pluginManifest.name}`);
            continue;
          }

          // Register named exports if available (e.g., { components: { 'id': Component } })
          if (module.components && typeof module.components === 'object') {
            for (const [componentId, component] of Object.entries(module.components)) {
              console.log(`[PluginRegistry] Registering component: ${componentId}`);
              const registered: RegisteredPlugin = {
                manifest: pluginManifest,
                component: component as WorkspaceComponent,
                path,
              };

              if (type === 'workspace') {
                this.workspaces.set(componentId, registered);
              } else {
                this.components.set(componentId, registered);
              }
            }
          }

          // Also register default export
          if (module.default) {
            const registered: RegisteredPlugin = {
              manifest: pluginManifest,
              component: module.default,
              path,
            };

            if (type === 'workspace') {
              this.workspaces.set(pluginManifest.name, registered);
            } else {
              this.components.set(pluginManifest.name, registered);
            }

            log.plugin(`Found workspace: ${pluginManifest.name}`);
          }
        } catch (error) {
          log.api(`[PluginRegistry] Error loading plugin at ${path}:`, error);
        }
      }
    } catch (error) {
      log.api(`[PluginRegistry] Error discovering plugins in ${baseDir}:`, error);
    }
  }

  /**
   * Load a component module
   */
  private async loadComponentModule(path: string): Promise<any | null> {
    try {
      // Use dynamic import to load the component module
      const module = await import(/* @vite-ignore */ path);
      return module;
    } catch (error) {
      log.api(`[PluginRegistry] Error loading component from ${path}:`, error);
      return null;
    }
  }

  /**
   * Validate plugin manifest
   */
  private validateManifest(manifest: any): manifest is PluginManifest {
    return (
      typeof manifest === 'object' &&
      typeof manifest.name === 'string' &&
      typeof manifest.version === 'string' &&
      typeof manifest.type === 'string' &&
      typeof manifest.sdkVersion === 'string' &&
      typeof manifest.displayName === 'string' &&
      typeof manifest.entrypoint === 'string'
    );
  }

  /**
   * Get a workspace component by name
   */
  getWorkspace(name: string): WorkspaceComponent | null {
    return this.workspaces.get(name)?.component || null;
  }

  /**
   * Get a component by name
   */
  getComponent(name: string): WorkspaceComponent | null {
    return this.components.get(name)?.component || null;
  }

  /**
   * Get workspace manifest
   */
  getWorkspaceManifest(name: string): PluginManifest | null {
    return this.workspaces.get(name)?.manifest || null;
  }

  /**
   * Get component manifest
   */
  getComponentManifest(name: string): PluginManifest | null {
    return this.components.get(name)?.manifest || null;
  }

  /**
   * List all registered workspaces
   */
  listWorkspaces(): Array<{ name: string; manifest: PluginManifest }> {
    return Array.from(this.workspaces.entries()).map(([name, plugin]) => ({
      name,
      manifest: plugin.manifest,
    }));
  }

  /**
   * List all registered components
   */
  listComponents(): Array<{ name: string; manifest: PluginManifest }> {
    return Array.from(this.components.entries()).map(([name, plugin]) => ({
      name,
      manifest: plugin.manifest,
    }));
  }

  /**
   * Check if a workspace is registered
   */
  hasWorkspace(name: string): boolean {
    return this.workspaces.has(name);
  }

  /**
   * Check if a component is registered
   */
  hasComponent(name: string): boolean {
    return this.components.has(name);
  }

  /**
   * Validate SDK version compatibility
   */
  validateSDKVersion(pluginName: string, currentSDKVersion: string): boolean {
    const plugin = this.workspaces.get(pluginName) || this.components.get(pluginName);
    if (!plugin) return false;

    const requiredVersion = plugin.manifest.sdkVersion;

    // Simple semver check (can be enhanced with a proper semver library)
    const required = requiredVersion.replace(/[\^~]/, '');
    const current = currentSDKVersion;

    // For now, just check major version compatibility
    const requiredMajor = required.split('.')[0];
    const currentMajor = current.split('.')[0];

    return requiredMajor === currentMajor;
  }
}

// Singleton instance
export const pluginRegistry = new PluginRegistry();
