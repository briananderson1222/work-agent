import { getCachedUser } from '../routes/auth.js';

interface ACPStatusConnection {
  id: string;
  status: string;
  modes: string[];
}

interface ACPStatusSnapshot {
  connections: ACPStatusConnection[];
}

interface RuntimeHealthContext {
  activeAgents: Map<string, any>;
  agentSpecs: Map<string, any>;
  memoryAdapters: Map<string, unknown>;
  mcpConnectionStatus: Map<string, { connected: boolean; error?: string }>;
  integrationMetadata: Map<
    string,
    { type: string; transport?: string; toolCount?: number }
  >;
  acpStatus: ACPStatusSnapshot;
  monitoringEmitter: {
    emitHealth: (payload: {
      slug: string;
      userId: string;
      traceId: string;
      healthy: boolean;
      checks: Record<string, boolean>;
      integrations?: Array<{
        id: string;
        type: string;
        connected: boolean;
        metadata?: { transport?: string; toolCount?: number };
      }>;
    }) => void;
  };
}

export async function runRuntimeHealthChecks(
  context: RuntimeHealthContext,
): Promise<void> {
  for (const [slug, agent] of context.activeAgents.entries()) {
    const checks: Record<string, boolean> = {
      loaded: true,
      hasModel: !!agent.model,
      hasMemory: context.memoryAdapters.has(slug),
    };

    const spec = context.agentSpecs.get(slug);
    const integrations: Array<{
      id: string;
      type: string;
      connected: boolean;
      metadata?: { transport?: string; toolCount?: number };
    }> = [];

    if (spec?.tools?.mcpServers && spec.tools.mcpServers.length > 0) {
      checks.integrationsConfigured = true;

      for (const id of spec.tools.mcpServers) {
        const key = `${slug}:${id}`;
        const status = context.mcpConnectionStatus.get(key);
        const metadata = context.integrationMetadata.get(key);

        integrations.push({
          id,
          type: metadata?.type || 'mcp',
          connected: status?.connected === true,
          metadata: metadata
            ? {
                transport: metadata.transport,
                toolCount: metadata.toolCount,
              }
            : undefined,
        });
      }

      checks.integrationsConnected = integrations.every(
        (integration) => integration.connected,
      );
    }

    const healthy = Object.values(checks).every(Boolean);
    const traceId = `health:${slug}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;

    context.monitoringEmitter.emitHealth({
      slug,
      userId: getCachedUser().alias,
      traceId,
      healthy,
      checks,
      integrations,
    });
  }

  for (const connection of context.acpStatus.connections) {
    const traceId = `health:acp:${connection.id}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    const healthy = connection.status === 'available';

    context.monitoringEmitter.emitHealth({
      slug: `acp:${connection.id}`,
      userId: getCachedUser().alias,
      traceId,
      healthy,
      checks: {
        connected: healthy,
        modesAvailable: connection.modes.length > 0,
      },
    });
  }
}

export function startRuntimeHealthChecks(context: {
  timers: NodeJS.Timeout[];
  logger: { debug: (message: string, metadata?: Record<string, unknown>) => void };
  interval?: number;
  runHealthChecks: () => Promise<void>;
}): void {
  const interval = context.interval ?? 60000;
  const runHealthChecks = async () => {
    await context.runHealthChecks();
  };

  runHealthChecks();
  context.timers.push(setInterval(runHealthChecks, interval));
  context.logger.debug('Health checks started', { interval });
}
