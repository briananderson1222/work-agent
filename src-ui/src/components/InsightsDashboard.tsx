import { useCallback, useEffect, useState } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';

// ── Types ──────────────────────────────────────────────

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

interface MessageRating {
  id: string;
  agentSlug: string;
  conversationId: string;
  messageIndex: number;
  messagePreview: string;
  rating: 'thumbs_up' | 'thumbs_down';
  reason?: string;
  analysis?: string;
  createdAt: string;
  analyzedAt?: string;
}

interface FeedbackSummary {
  reinforce: string[];
  avoid: string[];
  analyzedCount: number;
  updatedAt: string;
}

interface FeedbackStatus {
  lastAnalyzedAt?: string;
  nextAnalysisAt?: string;
  isAnalyzing: boolean;
  analyzeCallbackAvailable: boolean;
}

type Tab = 'usage' | 'feedback';

// ── Shared Styles ──────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontSize: '0.7rem',
  fontFamily: 'JetBrains Mono, monospace',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '0.75rem',
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '6px 16px',
  borderRadius: 6,
  border: '1px solid var(--border-primary)',
  background: active ? 'var(--accent-primary)' : 'transparent',
  color: active ? '#fff' : 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: '0.75rem',
  fontFamily: 'JetBrains Mono, monospace',
});

const pillBtn = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px',
  borderRadius: 6,
  border: '1px solid var(--border-primary)',
  background: active ? 'var(--accent-primary)' : 'transparent',
  color: active ? '#fff' : 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: '0.75rem',
  fontFamily: 'JetBrains Mono, monospace',
});

// ── Usage Tab (existing InsightsDashboard content) ─────

function UsageTab() {
  const { apiBase } = useApiBase();
  const [data, setData] = useState<Insights | null>(null);
  const [days, setDays] = useState(14);

  useEffect(() => {
    fetch(`${apiBase}/api/insights/insights?days=${days}`)
      .then((r) => r.json())
      .then((r) => setData(r.data))
      .catch(() => {});
  }, [apiBase, days]);

  if (!data)
    return (
      <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>
        Loading...
      </div>
    );

  const maxHourly = Math.max(...data.hourlyActivity, 1);
  const topTools = Object.entries(data.toolUsage)
    .sort((a, b) => b[1].calls - a[1].calls)
    .slice(0, 10);
  const maxToolCalls = topTools.length > 0 ? topTools[0][1].calls : 1;
  const agents = Object.entries(data.agentUsage).sort(
    (a, b) => b[1].chats - a[1].chats,
  );

  return (
    <>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={pillBtn(d === days)}
          >
            {d}d
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1px',
          background: 'var(--border-primary)',
          borderRadius: 10,
          overflow: 'hidden',
          marginBottom: '1.5rem',
        }}
      >
        {[
          { label: 'Chats', value: data.totalChats },
          { label: 'Tool Calls', value: data.totalToolCalls },
          { label: 'Errors', value: data.totalErrors },
        ].map((s) => (
          <div
            key={s.label}
            style={{ background: 'var(--bg-secondary)', padding: '1.25rem' }}
          >
            <div style={{ ...sectionLabel, marginBottom: '0.5rem' }}>
              {s.label}
            </div>
            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              {s.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={sectionLabel}>Activity by Hour</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 2,
            height: 60,
          }}
        >
          {data.hourlyActivity.map((count, hour) => (
            <div
              key={hour}
              title={`${hour}:00 — ${count} events`}
              style={{
                flex: 1,
                background:
                  count > 0 ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                height: `${Math.max((count / maxHourly) * 100, count > 0 ? 8 : 2)}%`,
                borderRadius: '2px 2px 0 0',
                opacity: count > 0 ? 0.5 + (count / maxHourly) * 0.5 : 0.2,
                transition: 'height 0.3s',
              }}
            />
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.6rem',
            color: 'var(--text-muted)',
            marginTop: 4,
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          <span>12am</span>
          <span>6am</span>
          <span>12pm</span>
          <span>6pm</span>
          <span>11pm</span>
        </div>
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}
      >
        <div>
          <div style={sectionLabel}>Top Tools</div>
          {topTools.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              No tool usage yet
            </div>
          ) : (
            topTools.map(([name, stats]) => (
              <div key={name} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '0.7rem',
                    }}
                  >
                    {name.length > 25 ? `${name.slice(0, 25)}…` : name}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {stats.calls}
                    {stats.errors > 0 ? ` (${stats.errors} err)` : ''}
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    background: 'var(--bg-tertiary)',
                    borderRadius: 2,
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${(stats.calls / maxToolCalls) * 100}%`,
                      background:
                        stats.errors > 0 ? '#e5534b' : 'var(--accent-primary)',
                      borderRadius: 2,
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
        <div>
          <div style={sectionLabel}>Agent Usage</div>
          {agents.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              No agent usage yet
            </div>
          ) : (
            agents.map(([name, stats]) => (
              <div
                key={name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: '1px solid var(--border-primary)',
                  fontSize: '0.8rem',
                }}
              >
                <span style={{ color: 'var(--text-primary)' }}>{name}</span>
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.7rem',
                  }}
                >
                  {stats.chats} chats · {(stats.tokens / 1000).toFixed(1)}k tok
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ── Feedback Tab ───────────────────────────────────────

function FeedbackTab() {
  const { apiBase } = useApiBase();
  const [ratings, setRatings] = useState<MessageRating[]>([]);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [filter, setFilter] = useState<
    'all' | 'thumbs_up' | 'thumbs_down' | 'pending' | 'no_reason'
  >('all');
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState<FeedbackStatus | null>(null);

  const refresh = useCallback(() => {
    fetch(`${apiBase}/api/feedback/ratings`)
      .then((r) => r.json())
      .then((r) => setRatings(r.data || []))
      .catch(() => {});
    fetch(`${apiBase}/api/feedback/guidelines`)
      .then((r) => r.json())
      .then((r) => setSummary(r.data?.summary || null))
      .catch(() => {});
    fetch(`${apiBase}/api/feedback/status`)
      .then((r) => r.json())
      .then((r) => setStatus(r.data || null))
      .catch(() => {});
  }, [apiBase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const noReason = ratings.filter((r) => !r.reason).length;

  const filtered = ratings.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return !r.analyzedAt;
    if (filter === 'no_reason') return !r.reason;
    return r.rating === filter;
  });

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      await fetch(`${apiBase}/api/feedback/analyze`, { method: 'POST' });
      refresh();
    } finally {
      setAnalyzing(false);
    }
  };

  const handleClear = async () => {
    await fetch(`${apiBase}/api/feedback/clear-analysis`, { method: 'POST' });
    refresh();
  };

  const handleDelete = async (r: MessageRating) => {
    await fetch(`${apiBase}/api/feedback/rate`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: r.conversationId, messageIndex: r.messageIndex }),
    });
    refresh();
  };

  const liked = ratings.filter((r) => r.rating === 'thumbs_up').length;
  const disliked = ratings.filter((r) => r.rating === 'thumbs_down').length;
  const pending = ratings.filter((r) => !r.analyzedAt).length;

  const relativeTime = (iso?: string) => {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.round(mins / 60)} hr ago`;
  };

  const relativeIn = (iso?: string) => {
    if (!iso) return null;
    const diff = new Date(iso).getTime() - Date.now();
    const mins = Math.round(diff / 60_000);
    if (mins <= 0) return 'soon';
    if (mins < 60) return `in ${mins} min`;
    return `in ${Math.round(mins / 60)} hr`;
  };

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}
    >
      {/* Left: Ratings list */}
      <div>
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1rem',
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              ['all', `All (${ratings.length})`],
              ['thumbs_up', `👍 Liked (${liked})`],
              ['thumbs_down', `👎 Disliked (${disliked})`],
              ['pending', `⏳ Pending (${pending})`],
              ['no_reason', `💭 No Reason (${noReason})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={pillBtn(filter === key)}
            >
              {label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.8rem',
              padding: '1rem 0',
            }}
          >
            {ratings.length === 0
              ? 'No ratings yet. Rate agent messages with 👍/👎 to start building your feedback profile.'
              : 'No ratings match this filter.'}
          </div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filtered.map((r) => (
              <div
                key={r.id}
                style={{
                  padding: '10px 12px',
                  marginBottom: 6,
                  background: 'var(--bg-secondary)',
                  borderRadius: 8,
                  border: '1px solid var(--border-primary)',
                  position: 'relative',
                }}
              >
                <button
                  onClick={() => handleDelete(r)}
                  title="Delete rating"
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: '0.7rem',
                    lineHeight: 1,
                    padding: '2px 4px',
                    borderRadius: 3,
                  }}
                >
                  ✕
                </button>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 4,
                    paddingRight: 20,
                  }}
                >
                  <span style={{ fontSize: '0.75rem' }}>
                    {r.rating === 'thumbs_up' ? '👍' : '👎'}{' '}
                    <span
                      style={{
                        color: 'var(--text-muted)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.65rem',
                      }}
                    >
                      {r.agentSlug}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: '0.6rem',
                      color: 'var(--text-muted)',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-primary)',
                    marginBottom: r.reason || r.analysis ? 6 : 0,
                    lineHeight: 1.4,
                  }}
                >
                  {r.messagePreview.length > 120
                    ? `${r.messagePreview.slice(0, 120)}…`
                    : r.messagePreview}
                </div>
                {r.reason && (
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: r.rating === 'thumbs_up' ? '#3fb950' : '#e5534b',
                      fontStyle: 'italic',
                    }}
                  >
                    "{r.reason}"
                  </div>
                )}
                {r.analysis && (
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      marginTop: 4,
                      padding: '6px 8px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 4,
                    }}
                  >
                    🔍 {r.analysis}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Behavior summary */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}
        >
          <div style={sectionLabel}>Learned Behaviors</div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              style={{ ...pillBtn(false), opacity: analyzing ? 0.5 : 1 }}
            >
              {analyzing ? '⏳ Analyzing...' : '🔄 Analyze'}
            </button>
            <button onClick={handleClear} style={pillBtn(false)}>
              Clear
            </button>
          </div>
        </div>

        {status && (
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            {status.isAnalyzing && (
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)', animation: 'pulse 1s ease-in-out infinite' }} />
            )}
            {status.lastAnalyzedAt
              ? `Last analyzed: ${relativeTime(status.lastAnalyzedAt)}${status.nextAnalysisAt ? ` · Next: ${relativeIn(status.nextAnalysisAt)}` : ''}`
              : 'Not yet analyzed'}
          </div>
        )}

        {!summary ? (
          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.8rem',
              padding: '1rem 0',
            }}
          >
            No analysis yet. Rate some messages, then click Analyze or wait for
            the automatic 10-minute cycle.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '1.25rem' }}>
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: '#3fb950',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                ✅ Behaviors to Reinforce
              </div>
              {summary.reinforce.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  None identified yet
                </div>
              ) : (
                summary.reinforce.map((b, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-primary)',
                      padding: '4px 0',
                      borderBottom: '1px solid var(--border-primary)',
                    }}
                  >
                    {b}
                  </div>
                ))
              )}
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: '#e5534b',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                ❌ Behaviors to Avoid
              </div>
              {summary.avoid.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  None identified yet
                </div>
              ) : (
                summary.avoid.map((b, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-primary)',
                      padding: '4px 0',
                      borderBottom: '1px solid var(--border-primary)',
                    }}
                  >
                    {b}
                  </div>
                ))
              )}
            </div>

            <div
              style={{
                marginTop: '1rem',
                fontSize: '0.65rem',
                color: 'var(--text-muted)',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              Based on {summary.analyzedCount} rated messages · Updated{' '}
              {new Date(summary.updatedAt).toLocaleString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Combined Dashboard ─────────────────────────────────

export function InsightsDashboard() {
  const [tab, setTab] = useState<Tab>('usage');

  return (
    <div style={{ padding: '1.5rem 0' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button onClick={() => setTab('usage')} style={tabBtn(tab === 'usage')}>
          📊 Usage
        </button>
        <button
          onClick={() => setTab('feedback')}
          style={tabBtn(tab === 'feedback')}
        >
          💬 Feedback
        </button>
      </div>
      {tab === 'usage' ? <UsageTab /> : <FeedbackTab />}
    </div>
  );
}
