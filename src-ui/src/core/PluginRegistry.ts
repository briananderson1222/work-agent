/**
 * Plugin Registry — Runtime plugin discovery and loading
 *
 * Fetches installed plugins from /api/plugins, loads pre-built IIFE bundles
 * via script injection, and registers workspace components.
 */

import type { LayoutComponent } from '@stallion-ai/sdk';
import { log } from '@/utils/logger';

export class PluginRegistry {
  private layouts = new Map<string, LayoutComponent>();
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
        `[PluginRegistry] Loaded ${this.pluginMeta.size} plugins, ${this.layouts.size} components`,
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

      // Load IIFE bundle via script tag — it registers on window.__stallion_ai_plugins
      await this.loadScript(bundleUrl);

      const pluginExports = (window as any).__stallion_ai_plugins?.[name];
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
          this.layouts.set(id, component as LayoutComponent);
          log.plugin(`[PluginRegistry] Registered: ${id}`);
        }
      }

      // Also register default export
      if (pluginExports.default) {
        this.layouts.set(name, pluginExports.default as LayoutComponent);
      }

      this.pluginMeta.set(name, pluginMeta);
    } catch (e) {
      log.api(`[PluginRegistry] Failed to load plugin ${name}:`, e);
    }
  }

  private loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!(window as any).require) {
        const shared = (window as any).__stallion_ai_shared || {};
        (window as any).require = (m: string) => {
          // Alias old package names
          if (shared[m]) return shared[m];
          if (m.startsWith('react')) return shared.react;
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
    this.layouts.clear();
    this.pluginMeta.clear();
    await this.initialize();
  }

  getLayout(name: string): LayoutComponent | null {
    return this.layouts.get(name) || null;
  }

  getComponent(name: string): LayoutComponent | null {
    return this.layouts.get(name) || null;
  }

  hasLayout(name: string): boolean {
    return this.layouts.has(name);
  }

  hasComponent(name: string): boolean {
    return this.layouts.has(name);
  }

  listLayouts(): Array<{ name: string; manifest: any }> {
    return Array.from(this.pluginMeta.entries()).map(([name, manifest]) => ({
      name,
      manifest,
    }));
  }

  listComponents() {
    return this.listLayouts();
  }
  getLayoutManifest(name: string) {
    return this.pluginMeta.get(name) || null;
  }
  getComponentManifest(name: string) {
    return this.getLayoutManifest(name);
  }

  /** Aggregate links from all plugins, optionally filtered by placement */
  getLinks(
    placement?: string,
  ): Array<{ label: string; href: string; icon?: string; placement?: string }> {
    const links: Array<{
      label: string;
      href: string;
      icon?: string;
      placement?: string;
    }> = [];
    for (const meta of this.pluginMeta.values()) {
      for (const link of meta.links || []) {
        if (!placement || link.placement === placement) links.push(link);
      }
    }
    return links;
  }
}

export const pluginRegistry = new PluginRegistry();
