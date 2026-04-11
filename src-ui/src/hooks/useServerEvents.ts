/**
 * useServerEvents — single SSE connection to /events.
 * Dispatches server-pushed events to React Query invalidations and callbacks.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';
import { navigationStore } from '../contexts/NavigationContext';
import { toastStore } from '../contexts/ToastContext';
import { pluginRegistry } from '../core/PluginRegistry';

type EventHandler = (data: Record<string, unknown>) => void;

/** Handlers that receive event data (for side-effects beyond query invalidation) */
const DATA_HANDLERS: Record<string, (data: Record<string, unknown>) => void> = {
  'notification:delivered': (data) => {
    const title = data.title as string | undefined;
    if (title) {
      const body = data.body as string | undefined;
      const ttl = typeof data.ttl === 'number' ? data.ttl : 8000;
      const metadata = data.metadata as Record<string, unknown> | undefined;
      toastStore.show(
        title + (body ? ` — ${body}` : ''),
        undefined,
        ttl,
        undefined,
        metadata,
      );
    }
  },
  'plugins:updates-available': (data) => {
    const count = data.count as number | undefined;
    const updates = data.updates as
      | Array<{
          name: string;
          currentVersion: string;
          latestVersion: string;
          source: string;
        }>
      | undefined;
    if (count && count > 0) {
      const detail = updates
        ?.map(
          (u) =>
            `${u.name}: ${u.currentVersion} → ${u.latestVersion} (${u.source})`,
        )
        .join('\n');
      toastStore.show(
        `${count} plugin update${count > 1 ? 's' : ''} available`,
        undefined,
        10000,
        [
          {
            label: 'View Updates',
            variant: 'primary',
            onClick: () => navigationStore.navigate('/manage/plugins'),
          },
        ],
        { detail },
      );
    }
  },
  'ui:navigate': (data) => {
    const path = data.path as string | undefined;
    if (path && typeof path === 'string' && path.startsWith('/')) {
      navigationStore.navigate(path);
    }
  },
};

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
    void pluginRegistry.reload().catch(() => {});
  },
  'plugins:updated': (qc) => {
    qc.invalidateQueries({ queryKey: ['plugins'] });
    qc.invalidateQueries({ queryKey: ['layouts'] });
    void pluginRegistry.reload().catch(() => {});
  },
  'plugins:updates-available': (qc) => {
    qc.invalidateQueries({ queryKey: ['plugin-updates'] });
  },
  'notification:delivered': (qc) =>
    qc.invalidateQueries({ queryKey: ['notifications'] }),
  'notification:dismissed': (qc) =>
    qc.invalidateQueries({ queryKey: ['notifications'] }),
  'notification:updated': (qc) =>
    qc.invalidateQueries({ queryKey: ['notifications'] }),
  'notification:cleared': (qc) =>
    qc.invalidateQueries({ queryKey: ['notifications'] }),
  'ui:navigate': () => {},
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
        es.addEventListener(event, (e: MessageEvent) => {
          EVENT_HANDLERS[event](queryClient);
          // Also run data handler if one exists for this event
          if (DATA_HANDLERS[event]) {
            try {
              DATA_HANDLERS[event](JSON.parse(e.data));
            } catch {
              /* ignore parse errors */
            }
          }
        });
      }

      // Generic data:changed handler — invalidates specific query keys from server
      es.addEventListener('data:changed', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const keys = data.keys as string[] | undefined;
          if (keys) {
            for (const key of keys) {
              queryClient.invalidateQueries({ queryKey: [key] });
            }
          }
        } catch {}
      });

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
