import type { EventHandler } from '../types';

export class EventsAPI {
  private handlers = new Map<string, Set<EventHandler>>();

  on<T = any>(event: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  once<T = any>(event: string, handler: EventHandler<T>): void {
    const wrapper = (data: T) => {
      handler(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  emit<T = any>(event: string, data: T): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  off<T = any>(event: string, handler: EventHandler<T>): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }
}
