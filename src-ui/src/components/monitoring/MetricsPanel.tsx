import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useApiBase } from '../../contexts/ApiBaseContext';

interface AgentMetric {
  agentSlug: string;
  messageCount: number;
  conversationCount: number;
  totalCost: number;
}

type MetricsRange = 'today' | 'week' | 'month' | 'all';

export function MetricsPanel() {
  const { apiBase } = useApiBase();
  const [range, setRange] = useState<MetricsRange>('week');

  const { data: metrics } = useQuery<AgentMetric[]>({
    queryKey: ['monitoring-metrics', apiBase, range],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/monitoring/metrics?range=${range}`);
      const json = await res.json();
      return json.success ? json.data.metrics : [];
    },
    refetchInterval: 30000,
  });

  if (!metrics?.length) return null;

  const totals = metrics.reduce(
    (acc, m) => ({
      messages: acc.messages + m.messageCount,
      conversations: acc.conversations + m.conversationCount,
      cost: acc.cost + m.totalCost,
    }),
    { messages: 0, conversations: 0, cost: 0 },
  );

  return (
    <div className="metrics-panel">
      <div className="metrics-header">
        <h3>METRICS</h3>
        <div className="metrics-range-tabs">
          {(['today', 'week', 'month', 'all'] as const).map((r) => (
            <button
              key={r}
              className={range === r ? 'active' : ''}
              onClick={() => setRange(r)}
            >
              {r === 'all'
                ? 'All'
                : r === 'today'
                  ? '24h'
                  : r === 'week'
                    ? '7d'
                    : '30d'}
            </button>
          ))}
        </div>
      </div>
      <div className="metrics-summary">
        <div className="metrics-stat">
          <span className="metrics-stat-value">{totals.messages}</span>
          <span className="metrics-stat-label">Messages</span>
        </div>
        <div className="metrics-stat">
          <span className="metrics-stat-value">{totals.conversations}</span>
          <span className="metrics-stat-label">Conversations</span>
        </div>
        {totals.cost > 0 && (
          <div className="metrics-stat">
            <span className="metrics-stat-value">
              ${totals.cost.toFixed(4)}
            </span>
            <span className="metrics-stat-label">Cost</span>
          </div>
        )}
      </div>
      {metrics.length > 1 && (
        <div className="metrics-breakdown">
          {metrics.map((m) => (
            <div key={m.agentSlug} className="metrics-agent-row">
              <span className="metrics-agent-name">{m.agentSlug}</span>
              <span className="metrics-agent-stat">{m.messageCount} msgs</span>
              <span className="metrics-agent-stat">
                {m.conversationCount} convs
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
