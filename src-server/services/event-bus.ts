/**
 * EventBus — typed pub/sub for server-side state changes.
 * Any service can emit; the SSE endpoint subscribes and pushes to clients.
 */

export interface ServerEvent {
  event: string;
  data?: Record<string, unknown>;
}

type Listener = (event: ServerEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event: string, data?: Record<string, unknown>): void {
    const evt: ServerEvent = { event, data };
    for (const fn of this.listeners) {
      try {
        fn(evt);
      } catch {
        this.listeners.delete(fn);
      }
    }
  }
}
