import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { log } from '@/utils/logger';
import { useApiBase } from './ApiBaseContext';
import { K, OP, SPAN } from '../monitoring-keys';

export interface AgentStats {
  slug: string;
  name: string;
  status: 'idle' | 'active' | 'running';
  model: string;
  conversationCount: number;
  messageCount: number;
  cost: number;
  healthy?: boolean;
}

export interface MonitoringStats {
  agents: AgentStats[];
  summary: {
    totalAgents: number;
    activeAgents: number;
    runningAgents: number;
    totalMessages: number;
    totalCost: number;
  };
}

export interface MonitoringEvent {
  timestamp: string;
  'timestamp.ms': number;
  'trace.id': string;
  'gen_ai.operation.name': string;
  'gen_ai.provider.name'?: string;
  'gen_ai.request.model'?: string;
  'gen_ai.conversation.id'?: string;
  'gen_ai.usage.input_tokens'?: number;
  'gen_ai.usage.output_tokens'?: number;
  'gen_ai.response.finish_reasons'?: string[];
  'gen_ai.tool.name'?: string;
  'gen_ai.tool.call.id'?: string;
  'gen_ai.tool.call.arguments'?: unknown;
  'gen_ai.tool.call.result'?: unknown;
  'span.kind': 'start' | 'end' | 'event' | 'log';
  'stallion.agent.slug'?: string;
  'stallion.agent.steps'?: number;
  'stallion.agent.max_steps'?: number;
  'stallion.input.chars'?: number;
  'stallion.output.chars'?: number;
  'stallion.artifacts'?: Array<{ type: string; name?: string; content?: unknown }>;
  'stallion.user.id'?: string;
  'stallion.health.healthy'?: boolean;
  'stallion.health.checks'?: Record<string, boolean>;
  'stallion.health.integrations'?: Array<{ id: string; type: string; connected: boolean; metadata?: { transport?: string; toolCount?: number } }>;
  'stallion.reasoning.text'?: string;
  'stallion.agent_telemetry.session_id'?: string;
  'stallion.agent_telemetry.event_id'?: string;
  'stallion.agent_telemetry.schema_version'?: string;
  'stallion.agent_telemetry.context'?: unknown;
  'stallion.agent_telemetry.enrichment'?: unknown;
  [key: string]: unknown;
}

class MonitoringStore {
  private stats: MonitoringStats | null = null;
  private events: MonitoringEvent[] = [];
  private listeners = new Set<() => void>();
  private eventSource: EventSource | null = null;
  private apiBase: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastHeartbeat: number = Date.now();
  private heartbeatCheckInterval: NodeJS.Timeout | null = null;
  private cachedSnapshot: {
    stats: MonitoringStats | null;
    events: MonitoringEvent[];
  } | null = null;
  isLiveMode: boolean = true;
  dateRange: { start?: Date; end?: Date } | null = null;

  constructor(apiBase: string) {
    this.apiBase = apiBase;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => {
    if (!this.cachedSnapshot) {
      this.cachedSnapshot = {
        stats: this.stats,
        events: this.events,
      };
    }
    return this.cachedSnapshot;
  };

  private notify() {
    this.cachedSnapshot = null;
    this.listeners.forEach((listener) => listener());
  }

  async fetchStats() {
    try {
      const response = await fetch(`${this.apiBase}/monitoring/stats`);
      const result = await response.json();
      if (result.success) {
        this.stats = result.data;
        this.notify();
      }
    } catch (error) {
      log.api('Failed to fetch monitoring stats:', error);
    }
  }

  async fetchHistoricalEvents(start?: Date, end?: Date) {
    try {
      const params = new URLSearchParams();
      if (start) params.set('start', start.toISOString());
      if (end) params.set('end', end.toISOString());

      const response = await fetch(
        `${this.apiBase}/monitoring/events?${params}`,
      );
      const result = await response.json();

      if (result.success) {
        this.events = result.data;
        this.notify();
      }
    } catch (error) {
      log.api('Failed to fetch historical events:', error);
    }
  }

  setDateRange(range: 'now' | 'today' | 'week' | 'month' | 'all') {
    const now = new Date();
    let start: Date | undefined;
    let end: Date | undefined = now;

    switch (range) {
      case 'now':
        // Live mode - no date range
        this.isLiveMode = true;
        this.dateRange = null;
        this.disconnect();
        this.connectEventStream();
        return;

      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;

      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;

      case 'month':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;

      case 'all':
        start = undefined;
        end = undefined;
        break;
    }

    this.isLiveMode = false;
    this.dateRange = { start, end };
    this.disconnect();
    this.fetchHistoricalEvents(start, end);
  }

  setTimeRange(start?: Date, end?: Date, isLive: boolean = false) {
    if (isLive) {
      this.isLiveMode = true;
      this.dateRange = start ? { start, end } : null;
      this.disconnect();
      this.connectEventStream(start);
    } else {
      this.isLiveMode = false;
      this.dateRange = { start, end };
      this.disconnect();
      this.fetchHistoricalEvents(start, end);
    }
  }

  connectEventStream(startFrom?: Date) {
    if (this.eventSource) return;

    // Load historical data from specified start time or last 5 minutes
    const now = new Date();
    const start = startFrom || new Date(now.getTime() - 5 * 60 * 1000);
    this.fetchHistoricalEvents(start, now);

    this.eventSource = new EventSource(
      `${this.apiBase}/monitoring/events`,
    );

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Filter out SSE protocol events
        if (data[K.SYSTEM_TYPE] === 'heartbeat') {
          this.lastHeartbeat = Date.now();
          return;
        }
        if (data[K.SYSTEM_TYPE] === 'connected') {
          return; // SSE handshake, not a monitoring event
        }

        this.events = [data, ...this.events].slice(0, 1000);

        // Update stats in real-time based on events
        if (data[K.OP_NAME] === OP.INVOKE_AGENT && data[K.SPAN_KIND] === SPAN.START && this.stats) {
          const agent = this.stats.agents.find(
            (a) => a.slug === data[K.AGENT_SLUG],
          );
          if (agent) agent.status = 'running';
        } else if (data[K.OP_NAME] === OP.INVOKE_AGENT && data[K.SPAN_KIND] === SPAN.END && this.stats) {
          const agent = this.stats.agents.find(
            (a) => a.slug === data[K.AGENT_SLUG],
          );
          if (agent) {
            agent.status = 'idle';
            agent.messageCount += 2; // User + assistant message
          }
        } else if (data[K.SPAN_KIND] === SPAN.LOG && data[K.HEALTHY] !== undefined && this.stats) {
          const agent = this.stats.agents.find(
            (a) => a.slug === data[K.AGENT_SLUG],
          );
          if (agent) agent.healthy = data[K.HEALTHY] as boolean;
        }

        this.notify();
      } catch (error) {
        log.api('Failed to parse event:', error);
      }
    };

    this.eventSource.onerror = () => {
      log.api('EventSource error, reconnecting...');
      this.disconnect();
      setTimeout(() => this.connectEventStream(), 5000);
    };

    // Poll stats every 5 seconds
    this.pollInterval = setInterval(() => this.fetchStats(), 5000);
    this.fetchStats(); // Initial fetch

    // Check heartbeat every 10 seconds - reset running agents if no heartbeat
    this.heartbeatCheckInterval = setInterval(() => {
      const timeSinceHeartbeat = Date.now() - this.lastHeartbeat;
      if (timeSinceHeartbeat > 60000 && this.stats) {
        // 60 seconds without heartbeat
        log.api('No heartbeat for 60s, resetting running agents to idle');
        this.stats.agents.forEach((agent) => {
          if (agent.status === 'running') {
            agent.status = 'idle';
          }
        });
        this.notify();
      }
    }, 10000);
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
    }
  }

  clearEvents() {
    this.events = [];
    this.notify();
  }
}

const stores = new Map<string, MonitoringStore>();

function getStore(apiBase: string): MonitoringStore {
  if (!stores.has(apiBase)) {
    const store = new MonitoringStore(apiBase);
    store.connectEventStream();
    stores.set(apiBase, store);
  }
  return stores.get(apiBase)!;
}

export function useMonitoring() {
  const { apiBase } = useApiBase();
  const store = useMemo(() => getStore(apiBase), [apiBase]);
  const data = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const clearEvents = useCallback(() => store.clearEvents(), [store]);
  const refresh = useCallback(() => store.fetchStats(), [store]);
  const setDateRange = useCallback(
    (range: 'now' | 'today' | 'week' | 'month' | 'all') =>
      store.setDateRange(range),
    [store],
  );
  const setTimeRange = useCallback(
    (start?: Date, end?: Date, isLive?: boolean) =>
      store.setTimeRange(start, end, isLive),
    [store],
  );

  return {
    stats: data.stats,
    events: data.events,
    clearEvents,
    refresh,
    setDateRange,
    setTimeRange,
  };
}
