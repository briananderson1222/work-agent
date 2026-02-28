/**
 * SSE endpoint — single event stream for all real-time updates.
 * Replays current state on connect so clients don't miss events that fired before they subscribed.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { EventBus } from '../services/event-bus.js';

export interface EventRouteDeps {
  eventBus: EventBus;
  getACPStatus: () => { connected: boolean; connections: Array<{ id: string; status: string }> };
  logger: any;
}

export function createEventRoutes({ eventBus, getACPStatus, logger }: EventRouteDeps) {
  const app = new Hono();

  app.get('/', (c) => {
    return streamSSE(c, async (stream) => {
      // Replay current ACP state so clients that connect after startup get the truth
      const acpStatus = getACPStatus();
      await stream.writeSSE({ event: 'acp:status', data: JSON.stringify(acpStatus) });

      const unsub = eventBus.subscribe((evt) => {
        stream.writeSSE({ event: evt.event, data: JSON.stringify(evt.data || {}) })
          .catch(() => { /* client gone */ });
      });

      const keepAlive = setInterval(() => {
        stream.writeSSE({ event: 'ping', data: '' }).catch(() => {});
      }, 30_000);

      try {
        await new Promise((_, reject) => {
          stream.onAbort(() => reject(new Error('aborted')));
        });
      } catch { /* client disconnected */ }

      clearInterval(keepAlive);
      unsub();
      logger.debug('SSE client disconnected');
    });
  });

  return app;
}
