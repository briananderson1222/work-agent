/**
 * useServerEvents — single SSE connection to /events.
 * Dispatches server-pushed events to React Query invalidations and callbacks.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';

type EventHandler = (data: Record<string, unknown>) => void;

const EVENT_HANDLERS: Record<string, (queryClient: any) => void> = {
  'agents:changed': (qc) =>
    qc.invalidateQueries({ queryKey: ['agents'], refetchType: 'none' }),
  'acp:status': (qc) => {
    qc.invalidateQueries({ queryKey: ['agents'] });
    qc.invalidateQueries({ queryKey: ['acp-connections'] });
    qc.invalidateQueries({ queryKey: ['system-status'] });
  },
  'config:changed': (qc) => {
    qc.invalidateQueries({ queryKey: ['config'], refetchType: 'none' });
    qc.invalidateQueries({ queryKey: ['agents'], refetchType: 'none' });
  },
  'system:status-changed': (qc) =>
    qc.invalidateQueries({ queryKey: ['system-status'] }),
  'plugins:installed': (qc) => {
    qc.invalidateQueries({ queryKey: ['plugins'] });
    qc.invalidateQueries({ queryKey: ['layouts'] });
    qc.invalidateQueries({ queryKey: ['agents'] });
    // Hot-reload plugin bundles
    import('../core/PluginRegistry')
      .then(({ pluginRegistry }) => pluginRegistry.reload())
      .catch(() => {});
  },
  'plugins:updated': (qc) => {
    qc.invalidateQueries({ queryKey: ['plugins'] });
    qc.invalidateQueries({ queryKey: ['layouts'] });
    // Hot-reload plugin bundles
    import('../core/PluginRegistry')
      .then(({ pluginRegistry }) => pluginRegistry.reload())
      .catch(() => {});
  },
  'plugins:updates-available': (qc) => {
    qc.invalidateQueries({ queryKey: ['plugin-updates'] });
  },
};

export function useServerEvents(handlers?: Record<string, EventHandler>) {
  const { apiBase } = useApiBase();
  const queryClient = useQueryClient();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const url = `${apiBase}/events`;
    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      es = new EventSource(url);

      // Register built-in handlers
      for (const event of Object.keys(EVENT_HANDLERS)) {
        es.addEventListener(event, () => {
          EVENT_HANDLERS[event](queryClient);
        });
      }

      // Register custom handlers
      if (handlersRef.current) {
        for (const [event, handler] of Object.entries(handlersRef.current)) {
          es.addEventListener(event, (e: MessageEvent) => {
            try {
              handler(JSON.parse(e.data));
            } catch {
              handler({});
            }
          });
        }
      }

      es.onerror = () => {
        es?.close();
        // Reconnect after 3s (EventSource auto-reconnects, but we control the delay)
        retryTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      es?.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [apiBase, queryClient]);
}
