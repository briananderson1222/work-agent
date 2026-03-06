import { useState, useEffect } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';

interface Insights {
  toolUsage: Record<string, { calls: number; errors: number }>;
  hourlyActivity: number[];
  agentUsage: Record<string, { chats: number; tokens: number }>;
  modelUsage: Record<string, number>;
  totalChats: number;
  totalToolCalls: number;
  totalErrors: number;
  days: number;
}

export function InsightsDashboard() {
  const { apiBase } = useApiBase();
  const [data, setData] = useState<Insights | null>(null);
  const [days, setDays] = useState(14);

  useEffect(() => {
    fetch(`${apiBase}/api/insights/insights?days=${days}`)
      .then(r => r.json())
      .then(r => setData(r.data))
      .catch(() => {});
  }, [apiBase, days]);

  if (!data) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading insights...</div>;

  const maxHourly = Math.max(...data.hourlyActivity, 1);
  const topTools = Object.entries(data.toolUsage).sort((a, b) => b[1].calls - a[1].calls).slice(0, 10);
  const maxToolCalls = topTools.length > 0 ? topTools[0][1].calls : 1;
  const agents = Object.entries(data.agentUsage).sort((a, b) => b[1].chats - a[1].chats);

  return (
    <div style={{ padding: '1.5rem 0' }}>
      {/* Period selector */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[7, 14, 30].map(d => (
          <button key={d} onClick={() => setDays(d)} style={{
            padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border-primary)',
            background: d === days ? 'var(--accent-primary)' : 'transparent',
            color: d === days ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem',
            fontFamily: 'JetBrains Mono, monospace',
          }}>{d}d</button>
        ))}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'var(--border-primary)', borderRadius: 10, overflow: 'hidden', marginBottom: '1.5rem' }}>
        {[
          { label: 'Chats', value: data.totalChats },
          { label: 'Tool Calls', value: data.totalToolCalls },
          { label: 'Errors', value: data.totalErrors },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-secondary)', padding: '1.25rem' }}>
            <div style={{ fontSize: '0.65rem', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{s.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Hourly activity */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Activity by Hour</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
          {data.hourlyActivity.map((count, hour) => (
            <div key={hour} title={`${hour}:00 — ${count} events`} style={{
              flex: 1, background: count > 0 ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              height: `${Math.max((count / maxHourly) * 100, count > 0 ? 8 : 2)}%`,
              borderRadius: '2px 2px 0 0', opacity: count > 0 ? 0.5 + (count / maxHourly) * 0.5 : 0.2,
              transition: 'height 0.3s',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
          <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
        </div>
      </div>

      {/* Two columns: Tools + Agents */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Top Tools */}
        <div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Top Tools</div>
          {topTools.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No tool usage yet</div>
          ) : topTools.map(([name, stats]) => (
            <div key={name} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 3 }}>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem' }}>{name.length > 25 ? name.slice(0, 25) + '…' : name}</span>
                <span style={{ color: 'var(--text-muted)' }}>{stats.calls}{stats.errors > 0 ? ` (${stats.errors} err)` : ''}</span>
              </div>
              <div style={{ height: 4, background: 'var(--bg-tertiary)', borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${(stats.calls / maxToolCalls) * 100}%`, background: stats.errors > 0 ? '#e5534b' : 'var(--accent-primary)', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Agent Usage */}
        <div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Agent Usage</div>
          {agents.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No agent usage yet</div>
          ) : agents.map(([name, stats]) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-primary)', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-primary)' }}>{name}</span>
              <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem' }}>
                {stats.chats} chats · {(stats.tokens / 1000).toFixed(1)}k tok
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
