/**
 * Monitoring Routes - agent stats, metrics, and events
 */

import type { EventEmitter } from 'node:events';
import { getCachedUser } from './auth.js';
import { errorMessage } from './schemas.js';

/** Minimal agent shape used by monitoring routes. */
interface MonitoringAgent {
  name: string;
  model?: string | { modelId?: string };
}

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type { MonitoringEvent } from '../monitoring/schema.js';

// Type extensions for monitoring routes
interface ModelWithId {
  modelId?: string;
}

import type { ACPManager } from '../services/acp-bridge.js';

export interface MonitoringDeps {
  activeAgents: Map<string, MonitoringAgent>;
  agentStats: Map<
    string,
    { conversationCount: number; messageCount: number; lastUpdated: number }
  >;
  agentStatus: Map<string, 'idle' | 'running'>;
  memoryAdapters: Map<string, FileMemoryAdapter>;
  metricsLog: Array<{
    timestamp: number;
    agentSlug: string;
    event: string;
    conversationId?: string;
    messageCount?: number;
    cost?: number;
  }>;
  /** EventEmitter that produces OTel-shaped MonitoringEvent objects */
  monitoringEvents: EventEmitter;
  queryEventsFromDisk: (
    start: number,
    end: number,
    userId: string,
  ) => Promise<any[]>;
  acpBridge?: ACPManager;
  resolveAgentModel?: (
    slug: string,
    agent: MonitoringAgent,
  ) => Promise<string | null | undefined> | string | null | undefined;
}

export function createMonitoringRoutes(deps: MonitoringDeps) {
  const app = new Hono();

  // Get agent stats
  app.get('/stats', async (c) => {
    try {
      const agents = await Promise.all(
        Array.from(deps.activeAgents.entries()).map(async ([slug, agent]) => {
          let stats = deps.agentStats.get(slug);
          if (!stats) {
            const adapter = deps.memoryAdapters.get(slug);
            if (adapter) {
              const conversations = await adapter.getConversations(slug);
              let totalMessages = 0;
              for (const conv of conversations) {
                const messages = await adapter.getMessages(
                  conv.userId,
                  conv.id,
                );
                totalMessages += messages.length;
              }
              stats = {
                conversationCount: conversations.length,
                messageCount: totalMessages,
                lastUpdated: Date.now(),
              };
              deps.agentStats.set(slug, stats);
            } else {
              stats = {
                conversationCount: 0,
                messageCount: 0,
                lastUpdated: Date.now(),
              };
            }
          }

          const fallbackModelId =
            typeof agent.model === 'string'
              ? agent.model
              : (agent.model as ModelWithId)?.modelId || 'unknown';
          const modelId =
            (await deps.resolveAgentModel?.(slug, agent)) ||
            fallbackModelId ||
            'unknown';

          return {
            slug,
            name: agent.name,
            status: deps.agentStatus.get(slug) || 'idle',
            model: modelId,
            conversationCount: stats.conversationCount,
            messageCount: stats.messageCount,
            cost: 0,
            healthy: !!agent.model && deps.memoryAdapters.has(slug),
          };
        }),
      );

      // Append ACP connections as virtual agents
      if (deps.acpBridge) {
        const acpStatus = deps.acpBridge.getStatus();
        for (const conn of acpStatus.connections) {
          agents.push({
            slug: `acp:${conn.id}`,
            name: conn.name,
            status:
              conn.status === 'available'
                ? ('idle' as const)
                : ('idle' as const),
            model: conn.currentModel || 'ACP',
            conversationCount: 0,
            messageCount: 0,
            cost: 0,
            healthy: conn.status === 'available',
          });
        }
      }

      const totalCost = agents.reduce((sum, a) => sum + a.cost, 0);
      const totalMessages = agents.reduce((sum, a) => sum + a.messageCount, 0);

      return c.json({
        success: true,
        data: {
          agents,
          summary: {
            totalAgents: agents.length,
            activeAgents: 0,
            runningAgents: 0,
            totalMessages,
            totalCost,
          },
        },
      });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Get historical metrics with date filtering
  app.get('/metrics', async (c) => {
    try {
      const range = c.req.query('range') || 'all';
      const now = Date.now();
      let startTime = 0;

      switch (range) {
        case 'today':
          startTime = now - 24 * 60 * 60 * 1000;
          break;
        case 'week':
          startTime = now - 7 * 24 * 60 * 60 * 1000;
          break;
        case 'month':
          startTime = now - 30 * 24 * 60 * 60 * 1000;
          break;
        default:
          startTime = 0;
      }

      const filteredMetrics = deps.metricsLog.filter(
        (m) => m.timestamp >= startTime,
      );

      // Aggregate by agent
      const agentMetrics = new Map<
        string,
        { messages: number; conversations: Set<string>; cost: number }
      >();
      for (const metric of filteredMetrics) {
        if (!agentMetrics.has(metric.agentSlug)) {
          agentMetrics.set(metric.agentSlug, {
            messages: 0,
            conversations: new Set(),
            cost: 0,
          });
        }
        const stats = agentMetrics.get(metric.agentSlug)!;
        stats.messages += metric.messageCount || 0;
        stats.cost += metric.cost || 0;
        if (metric.conversationId) {
          stats.conversations.add(metric.conversationId);
        }
      }

      const summary = Array.from(agentMetrics.entries()).map(
        ([slug, stats]) => ({
          agentSlug: slug,
          messageCount: stats.messages,
          conversationCount: stats.conversations.size,
          totalCost: stats.cost,
        }),
      );

      return c.json({ success: true, data: { range, metrics: summary } });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Get historical events or stream live events (SSE)
  app.get('/events', async (c) => {
    const startTime = c.req.query('start');
    const endTime = c.req.query('end');
    const userId =
      c.req.query('userId') ||
      c.req.header('x-user-id') ||
      getCachedUser().alias;

    // If time range specified, return historical events as JSON
    if (startTime || endTime) {
      const start = startTime ? new Date(startTime).getTime() : 0;
      const end = endTime ? new Date(endTime).getTime() : Date.now();

      const filteredEvents = await deps.queryEventsFromDisk(start, end, userId);

      return c.json({ success: true, data: filteredEvents });
    }

    // Otherwise, stream live events via SSE
    return streamSSE(c, async (stream) => {
      const now = Date.now();
      const connectedEvent: MonitoringEvent = {
        timestamp: new Date(now).toISOString(),
        'timestamp.ms': now,
        'trace.id': 'system',
        'gen_ai.operation.name': 'invoke_agent',
        'span.kind': 'log',
        'stallion.system.type': 'connected',
      };
      await stream.writeSSE({ data: JSON.stringify(connectedEvent) });

      const eventHandler = (event: any) => {
        if (event.userId && event.userId !== userId) return;
        stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {});
      };

      deps.monitoringEvents.on('event', eventHandler);

      const interval = setInterval(() => {
        const hbNow = Date.now();
        const heartbeatEvent: MonitoringEvent = {
          timestamp: new Date(hbNow).toISOString(),
          'timestamp.ms': hbNow,
          'trace.id': 'system',
          'gen_ai.operation.name': 'invoke_agent',
          'span.kind': 'log',
          'stallion.system.type': 'heartbeat',
        };
        stream
          .writeSSE({ data: JSON.stringify(heartbeatEvent) })
          .catch(() => {});
      }, 30000);

      try {
        await new Promise((_, reject) => {
          stream.onAbort(() => reject(new Error('aborted')));
        });
      } catch {
        /* client disconnected */
      }

      clearInterval(interval);
      deps.monitoringEvents.off('event', eventHandler);
    });
  });

  return app;
}
