/**
 * contextRegistry — module-level singleton for MessageContextProvider registration.
 *
 * Context providers register themselves on import. The MessageContextContext
 * React context subscribes to registry changes via subscribe().
 *
 * No React dependency — pure module singleton.
 */
import { ListenerManager } from '../core/ListenerManager.js';
import type { MessageContextProvider } from './types.js';

class ContextRegistry extends ListenerManager {
  private _providers = new Map<string, MessageContextProvider>();

  register(provider: MessageContextProvider): void {
    this._providers.set(provider.id, provider);
    this._notify();
  }

  unregister(id: string): void {
    if (this._providers.delete(id)) this._notify();
  }

  getAll(): MessageContextProvider[] {
    return Array.from(this._providers.values());
  }

  get(id: string): MessageContextProvider | undefined {
    return this._providers.get(id);
  }

  /**
   * Compose all enabled providers into a single context string,
   * separated by newlines.
   */
  getComposedContext(): string | null {
    const parts: string[] = [];
    for (const p of this._providers.values()) {
      if (p.enabled) {
        const ctx = p.getContext();
        if (ctx) parts.push(ctx);
      }
    }
    return parts.length > 0 ? parts.join('\n') : null;
  }
}

export const contextRegistry = new ContextRegistry();
