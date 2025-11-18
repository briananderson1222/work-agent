import { useMemo, useSyncExternalStore } from 'react';
import { useApiBase } from './ApiBaseContext';

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
  type: string;
  timestamp: string;
  agentSlug?: string;
  conversationId?: string;
  reason?: string;
  toolName?: string;
  toolCallId?: string;
  input?: any;
  result?: any;
  artifacts?: Array<{ type: string; name?: string; content?: any }>;
  data?: any;
  healthy?: boolean;
  checks?: Record<string, boolean>;
  integrations?: Array<{ 
    id: string; 
    type: string;
    connected: boolean;
    metadata?: {
      transport?: string;
      toolCount?: number;
    };
  }>;
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
  private cachedSnapshot: { stats: MonitoringStats | null; events: MonitoringEvent[] } | null = null;
  private dateRange: { start?: Date; end?: Date } | null = null;
  private isLiveMode: boolean = true;

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
    this.listeners.forEach(listener => listener());
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
      console.error('Failed to fetch monitoring stats:', error);
    }
  }

  async fetchHistoricalEvents(start?: Date, end?: Date) {
    try {
      const params = new URLSearchParams();
      if (start) params.set('start', start.toISOString());
      if (end) params.set('end', end.toISOString());
      
      const response = await fetch(`${this.apiBase}/monitoring/events?${params}`);
      const result = await response.json();
      
      if (result.success) {
        this.events = result.data;
        this.notify();
      }
    } catch (error) {
      console.error('Failed to fetch historical events:', error);
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

  connectEventStream() {
    if (this.eventSource) return;

    this.eventSource = new EventSource(`${this.apiBase}/monitoring/events`);
    
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Filter out SSE protocol events
        if (data.type === 'heartbeat') {
          this.lastHeartbeat = Date.now();
          return;
        }
        if (data.type === 'connected') {
          return; // SSE handshake, not a monitoring event
        }
        
        this.events = [data, ...this.events].slice(0, 1000);
        
        // Update stats in real-time based on events
        if (data.type === 'agent-start' && this.stats) {
          const agent = this.stats.agents.find(a => a.slug === data.agentSlug);
          if (agent) agent.status = 'running';
        } else if (data.type === 'agent-complete' && this.stats) {
          const agent = this.stats.agents.find(a => a.slug === data.agentSlug);
          if (agent) {
            agent.status = 'idle';
            agent.messageCount += 2; // User + assistant message
          }
        } else if (data.type === 'agent-health' && this.stats) {
          const agent = this.stats.agents.find(a => a.slug === data.agentSlug);
          if (agent) agent.healthy = data.healthy;
        }
        
        this.notify();
      } catch (error) {
        console.error('Failed to parse event:', error);
      }
    };

    this.eventSource.onerror = () => {
      console.error('EventSource error, reconnecting...');
      this.disconnect();
      setTimeout(() => this.connectEventStream(), 5000);
    };

    // Poll stats every 5 seconds
    this.pollInterval = setInterval(() => this.fetchStats(), 5000);
    this.fetchStats(); // Initial fetch
    
    // Check heartbeat every 10 seconds - reset running agents if no heartbeat
    this.heartbeatCheckInterval = setInterval(() => {
      const timeSinceHeartbeat = Date.now() - this.lastHeartbeat;
      if (timeSinceHeartbeat > 60000 && this.stats) { // 60 seconds without heartbeat
        console.warn('No heartbeat for 60s, resetting running agents to idle');
        this.stats.agents.forEach(agent => {
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
  
  return {
    stats: data.stats,
    events: data.events,
    clearEvents: () => store.clearEvents(),
    refresh: () => store.fetchStats(),
    setDateRange: (range: 'now' | 'today' | 'week' | 'month' | 'all') => store.setDateRange(range),
  };
}
