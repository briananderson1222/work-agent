import { useState, useEffect } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';

interface DailyStats {
  messages: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  byAgent: Record<string, number>;
}

const AGENT_COLORS = [
  'var(--accent-primary)', '#a78bfa', '#f59e0b',
  '#22c55e', '#06b6d4', '#f472b6', '#fb923c',
];

function fmt(d: Date) { return d.toISOString().split('T')[0]; }
function shortAgent(a: string) { return a.startsWith('kiro-') ? a.slice(5) : a.split(':').pop() || a; }

export function ActivityTimeline() {
  const { apiBase } = useApiBase();
  const [fromDate, setFromDate] = useState(() => fmt(new Date(Date.now() - 13 * 86400000)));
  const [toDate, setToDate] = useState(() => fmt(new Date()));
  const [data, setData] = useState<{ byDate: Record<string, DailyStats>; lifetime: any; rangeSummary?: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  const fetchData = (from: string, to: string) => {
    setLoading(true);
    fetch(`${apiBase}/api/analytics/usage?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => setData(d.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(fromDate, toDate); }, [apiBase]);

  const handleSearch = () => fetchData(fromDate, toDate);

  if (loading && !data) return <div style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Loading activity...</div>;
  if (!data?.byDate) return null;

  const dates: string[] = [];
  const d = new Date(fromDate);
  const end = new Date(toDate);
  while (d <= end) { dates.push(fmt(d)); d.setDate(d.getDate() + 1); }

  const agentSet = new Set<string>();
  for (const day of Object.values(data.byDate)) {
    for (const a of Object.keys(day.byAgent)) agentSet.add(a);
  }
  const agents = Array.from(agentSet);
  const agentColorMap: Record<string, string> = {};
  agents.forEach((a, i) => { agentColorMap[a] = AGENT_COLORS[i % AGENT_COLORS.length]; });

  const maxMessages = Math.max(1, ...dates.map(d => data.byDate[d]?.messages || 0));
  const hoverDay = hoverDate ? data.byDate[hoverDate] : null;

  const inputStyle: React.CSSProperties = {
    padding: '0.3rem 0.5rem', fontSize: '0.8rem', borderRadius: '0.375rem',
    border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
  };

  return (
    <div>
      {/* Date range picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>From:</label>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={inputStyle} />
        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>To:</label>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={inputStyle} />
        <button onClick={handleSearch}
          style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '0.375rem', border: '1px solid var(--accent-primary)', background: 'var(--accent-primary)', color: '#fff', cursor: 'pointer' }}>
          Search
        </button>
      </div>

      {/* Summary bar */}
      {(() => {
        const rs = data.rangeSummary;
        const streak = data.lifetime?.streak ?? 0;
        return (
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem', fontSize: '0.85rem', flexWrap: 'wrap' }}>
            <span>Current Streak: <strong>{streak} days</strong></span>
            <span>Days Active: <strong>{rs?.activeDays ?? 0}/{rs?.totalDays ?? dates.length}</strong></span>
            <span>Total: <strong>{(rs?.totalMessages ?? 0).toLocaleString()} msgs</strong></span>
            <span>Avg/Day: <strong>{(rs?.avgPerDay ?? 0).toFixed(1)} msgs</strong></span>
            {(rs?.totalCost ?? 0) > 0 && <span>Cost: <strong>${rs.totalCost.toFixed(2)}</strong></span>}
          </div>
        );
      })()}

      {/* Chart + hover detail */}
      <div style={{ position: 'relative' }}>
        {/* Hover tooltip */}
        {hoverDate && hoverDay && (
          <div data-testid="chart-tooltip" style={{
            position: 'absolute', top: 0, right: 0, zIndex: 2,
            background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
            borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.8rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)', minWidth: 180,
          }}>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
              {new Date(hoverDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
            <div style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              {hoverDay.messages} messages · ${hoverDay.cost.toFixed(2)}
            </div>
            {Object.entries(hoverDay.byAgent)
              .sort(([, a], [, b]) => b - a)
              .map(([agent, count]) => (
                <div key={agent} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', marginTop: 2 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: agentColorMap[agent], flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortAgent(agent)}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{count}</span>
                </div>
              ))}
          </div>
        )}

        {/* Stacked bar chart */}
        <div style={{ display: 'flex', gap: 2, height: 160, marginBottom: '0.5rem', position: 'relative' }}>
          {/* Y-axis labels */}
          <div style={{ width: 32, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-secondary)', textAlign: 'right', paddingRight: 4 }}>
            <span>{maxMessages}</span>
            <span>{Math.round(maxMessages / 2)}</span>
            <span>0</span>
          </div>
          {/* Bars */}
          <div style={{ flex: 1, display: 'flex', gap: 2, position: 'relative' }}>
            {dates.map(date => {
              const day = data.byDate[date];
              const isHovered = date === hoverDate;
              const totalH = day && day.messages > 0 ? (day.messages / maxMessages) * 100 : 0;
              return (
                <div key={date} data-testid={`chart-col-${date}`} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                  {/* Invisible full-height hover target — absolutely positioned, covers entire column */}
                  <div
                    data-testid={`chart-hover-${date}`}
                    onMouseEnter={() => setHoverDate(date)}
                    onMouseLeave={() => setHoverDate(null)}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2, cursor: 'pointer' }}
                  />
                  {/* Visual bar — positioned at bottom */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: totalH > 0 ? `${totalH}%` : '2px',
                    opacity: hoverDate && !isHovered ? 0.4 : 1, transition: 'opacity 0.15s',
                  }}>
                    {totalH > 0 ? (
                      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', borderRadius: '2px 2px 0 0', overflow: 'hidden' }}>
                        {agents.map(agent => {
                          const count = day!.byAgent[agent] || 0;
                          if (!count) return null;
                          const pct = (count / day!.messages) * 100;
                          return <div key={agent} style={{ height: `${pct}%`, minHeight: 2, background: agentColorMap[agent] }} />;
                        })}
                      </div>
                    ) : (
                      <div style={{ height: 2, background: 'var(--border-primary)', borderRadius: 1 }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X-axis labels */}
      <div style={{ display: 'flex', gap: 2, fontSize: '0.6rem', color: 'var(--text-secondary)', paddingLeft: 36 }}>
        {dates.map((date, i) => (
          <div key={date} style={{ flex: 1, minWidth: 0, textAlign: 'center', overflow: 'hidden' }}>
            {i % Math.max(1, Math.floor(dates.length / 7)) === 0 ? date.slice(5) : ''}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem', fontSize: '0.75rem' }}>
        {agents.map(agent => (
          <span key={agent} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: agentColorMap[agent], display: 'inline-block' }} />
            {shortAgent(agent)}
          </span>
        ))}
      </div>
    </div>
  );
}
