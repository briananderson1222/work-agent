/**
 * Plugin Registry — Runtime plugin discovery and loading
 *
 * Fetches installed plugins from /api/plugins, loads pre-built IIFE bundles
 * via script injection, and registers workspace components.
 */

import type { WorkspaceComponent } from '@stallion-ai/sdk';
import { log } from '@/utils/logger';

export class PluginRegistry {
  private workspaces = new Map<string, WorkspaceComponent>();
  private pluginMeta = new Map<string, any>();
  private apiBase = '';

  setApiBase(apiBase: string) {
    this.apiBase = apiBase;
  }

  async initialize(): Promise<void> {
    if (!this.apiBase) return;

    try {
      const res = await fetch(`${this.apiBase}/api/plugins`);
      if (!res.ok) return;
      const { plugins } = await res.json();

      for (const plugin of plugins) {
        if (!plugin.hasBundle) continue;
        await this.loadPlugin(plugin);
      }

      log.plugin(
        `[PluginRegistry] Loaded ${this.pluginMeta.size} plugins, ${this.workspaces.size} components`,
      );
    } catch (e) {
      log.api('[PluginRegistry] Failed to initialize:', e);
    }
  }

  private async loadPlugin(pluginMeta: any): Promise<void> {
    const name = pluginMeta.name;
    try {
      // Load CSS first, then JS bundle
      await this.loadCSS(
        `${this.apiBase}/api/plugins/${encodeURIComponent(name)}/bundle.css`,
      );

      // Load JS bundle
      const bundleUrl = `${this.apiBase}/api/plugins/${encodeURIComponent(name)}/bundle.js`;

      // Load IIFE bundle via script tag — it registers on window.__work_agent_plugins
      await this.loadScript(bundleUrl);

      const pluginExports = (window as any).__work_agent_plugins?.[name];
      if (!pluginExports) {
        log.api(`[PluginRegistry] Plugin ${name} did not register exports`);
        return;
      }

      // Register named component exports
      if (
        pluginExports.components &&
        typeof pluginExports.components === 'object'
      ) {
        for (const [id, component] of Object.entries(
          pluginExports.components,
        )) {
          this.workspaces.set(id, component as WorkspaceComponent);
          log.plugin(`[PluginRegistry] Registered: ${id}`);
        }
      }

      // Also register default export
      if (pluginExports.default) {
        this.workspaces.set(name, pluginExports.default as WorkspaceComponent);
      }

      this.pluginMeta.set(name, pluginMeta);
    } catch (e) {
      log.api(`[PluginRegistry] Failed to load plugin ${name}:`, e);
    }
  }

  private loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!(window as any).require) {
        const shared = (window as any).__work_agent_shared || {};
        (window as any).require = (m: string) => {
          if (shared[m]) return shared[m];
          if (m === 'react') return shared.react;
          if (m === 'react/jsx-runtime' || m === 'react/jsx-dev-runtime')
            return shared['react/jsx-runtime'] || shared.react;
          console.warn('[Plugin] Unknown shared module:', m);
          return {};
        };
      }
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load: ${url}`));
      document.head.appendChild(script);
    });
  }

  private async loadCSS(url: string): Promise<void> {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const css = await res.text();
      if (!css.trim()) return;
      const style = document.createElement('style');
      style.textContent = css;
      style.setAttribute('data-plugin-css', url);
      document.head.appendChild(style);
    } catch {
      // CSS load failed — non-fatal
    }
  }

  /** Reload — re-fetch plugin list and load any new bundles */
  async reload(): Promise<void> {
    this.workspaces.clear();
    this.pluginMeta.clear();
    await this.initialize();
  }

  getWorkspace(name: string): WorkspaceComponent | null {
    return this.workspaces.get(name) || null;
  }

  getComponent(name: string): WorkspaceComponent | null {
    return this.workspaces.get(name) || null;
  }

  hasWorkspace(name: string): boolean {
    return this.workspaces.has(name);
  }

  hasComponent(name: string): boolean {
    return this.workspaces.has(name);
  }

  listWorkspaces(): Array<{ name: string; manifest: any }> {
    return Array.from(this.pluginMeta.entries()).map(([name, manifest]) => ({
      name,
      manifest,
    }));
  }

  listComponents() {
    return this.listWorkspaces();
  }
  getWorkspaceManifest(name: string) {
    return this.pluginMeta.get(name) || null;
  }
  getComponentManifest(name: string) {
    return this.getWorkspaceManifest(name);
  }
  validateSDKVersion() {
    return true;
  }
}

export const pluginRegistry = new PluginRegistry();
