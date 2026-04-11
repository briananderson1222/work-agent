import { listProviders } from '../providers/registry.js';

interface RuntimeTaskTimerContext {
  timers: NodeJS.Timeout[];
}

interface RuntimeLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
}

interface RuntimeEventBus {
  emit: (event: string, data?: Record<string, unknown>) => void;
}

interface ACPBridgeLike {
  startAll: (connections: any[]) => Promise<void>;
  isConnected: () => boolean;
}

export function mergeRuntimeACPConnections(
  acpConnections: any[],
  providerEntries: Array<{ provider: { getConnections?: () => any[] } }>,
): any[] {
  const providerConnections = providerEntries.flatMap(
    (entry) => entry.provider.getConnections?.() || [],
  );
  const configIds = new Set(acpConnections.map((connection: any) => connection.id));

  return [
    ...acpConnections,
    ...providerConnections.filter((connection: any) => !configIds.has(connection.id)),
  ];
}

export function scheduleRuntimeDailyReload(
  context: RuntimeTaskTimerContext & {
    reloadAgents: () => Promise<void>;
    setTimeoutImpl?: typeof setTimeout;
    getNow?: () => Date;
  },
): void {
  const setTimeoutImpl = context.setTimeoutImpl || setTimeout;
  const getNow = context.getNow || (() => new Date());

  const msUntilMidnight = () => {
    const now = getNow();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  };

  const scheduleNextReload = () => {
    context.timers.push(
      setTimeoutImpl(() => {
        context.reloadAgents().catch(() => {});
        scheduleNextReload();
      }, msUntilMidnight()),
    );
  };

  scheduleNextReload();
}

export function startRuntimeACPConnections(
  context: {
    loadACPConfig: () => Promise<{ connections: any[] }>;
    acpBridge: ACPBridgeLike;
    logger: RuntimeLogger;
    listProvidersFn?: typeof listProviders;
  },
): void {
  const listProvidersFn = context.listProvidersFn || listProviders;

  context
    .loadACPConfig()
    .then((acpConfig) => {
      const merged = mergeRuntimeACPConnections(
        acpConfig.connections,
        listProvidersFn('acpConnections'),
      );
      return context.acpBridge.startAll(merged);
    })
    .then(() => {
      if (context.acpBridge.isConnected()) {
        context.logger.info('[Runtime] ACP connections established');
      }
    })
    .catch((error: any) => {
      context.logger.warn('[Runtime] ACP startup failed', {
        error: error.message,
      });
    });
}

export function scheduleRuntimePluginUpdateCheck(
  context: RuntimeTaskTimerContext & {
    port: number;
    eventBus: RuntimeEventBus;
    logger: RuntimeLogger;
    fetchImpl?: typeof fetch;
    setTimeoutImpl?: typeof setTimeout;
  },
): void {
  const fetchImpl = context.fetchImpl || fetch;
  const setTimeoutImpl = context.setTimeoutImpl || setTimeout;

  context.timers.push(
    setTimeoutImpl(async () => {
      try {
        const response = await fetchImpl(
          `http://localhost:${context.port}/api/plugins/check-updates`,
        );
        if (!response.ok) return;

        const { updates } = (await response.json()) as { updates: any[] };
        if (updates.length > 0) {
          context.eventBus.emit('plugins:updates-available', {
            count: updates.length,
            updates,
          });
          context.logger.info('Plugin updates available', {
            count: updates.length,
          });
        }
      } catch (error: any) {
        context.logger.debug('Failed to check for plugin updates', {
          error: error.message,
        });
      }
    }, 5000),
  );
}
