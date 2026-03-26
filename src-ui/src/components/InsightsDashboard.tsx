import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useFeedbackGuidelinesQuery,
  useFeedbackRatingsQuery,
  useFeedbackStatusQuery,
  useInsightsQuery,
} from '@stallion-ai/sdk';
import { useApiBase } from '../contexts/ApiBaseContext';
import './InsightsDashboard.css';

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

// ── Usage Tab ──────────────────────────────────────────

function UsageTab() {
  const [days, setDays] = useState(14);

  const { data } = useInsightsQuery(days) as { data: Insights | undefined };

  if (!data)
    return <div className="insights-loading">Loading...</div>;

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
      <div className="insights-pill-row">
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`insights-pill ${d === days ? 'is-active' : ''}`}
          >
            {d}d
          </button>
        ))}
      </div>

      <div className="insights-stat-grid">
        {[
          { label: 'Chats', value: data.totalChats },
          { label: 'Tool Calls', value: data.totalToolCalls },
          { label: 'Errors', value: data.totalErrors },
        ].map((s) => (
          <div key={s.label} className="insights-stat-cell">
            <div className="insights-section-label">{s.label}</div>
            <div className="insights-stat-value">{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="insights-hourly">
        <div className="insights-section-label">Activity by Hour</div>
        <div className="insights-hourly-bars">
          {data.hourlyActivity.map((count, hour) => (
            <div
              key={hour}
              title={`${hour}:00 — ${count} events`}
              className={`insights-hourly-bar ${count > 0 ? 'has-data' : ''}`}
              style={{
                height: `${Math.max((count / maxHourly) * 100, count > 0 ? 8 : 2)}%`,
                opacity: count > 0 ? 0.5 + (count / maxHourly) * 0.5 : 0.2,
              }}
            />
          ))}
        </div>
        <div className="insights-hourly-labels">
          <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
        </div>
      </div>

      <div className="insights-two-col">
        <div>
          <div className="insights-section-label">Top Tools</div>
          {topTools.length === 0 ? (
            <div className="insights-empty">No tool usage yet</div>
          ) : (
            topTools.map(([name, stats]) => (
              <div key={name} className="insights-tool-row">
                <div className="insights-tool-header">
                  <span className="insights-mono-sm">
                    {name.length > 25 ? `${name.slice(0, 25)}…` : name}
                  </span>
                  <span className="insights-muted">
                    {stats.calls}{stats.errors > 0 ? ` (${stats.errors} err)` : ''}
                  </span>
                </div>
                <div className="insights-bar-track">
                  <div
                    className={`insights-bar-fill ${stats.errors > 0 ? 'has-errors' : ''}`}
                    style={{ width: `${(stats.calls / maxToolCalls) * 100}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
        <div>
          <div className="insights-section-label">Agent Usage</div>
          {agents.length === 0 ? (
            <div className="insights-empty">No agent usage yet</div>
          ) : (
            agents.map(([name, stats]) => (
              <div key={name} className="insights-agent-row">
                <span className="insights-text-primary">{name}</span>
                <span className="insights-mono-sm insights-muted">
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
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<
    'all' | 'thumbs_up' | 'thumbs_down' | 'pending' | 'no_reason'
  >('all');

  const { data: ratings = [] } = useFeedbackRatingsQuery() as { data: MessageRating[] };
  const { data: summary } = useFeedbackGuidelinesQuery() as { data: FeedbackSummary | null };
  const { data: status } = useFeedbackStatusQuery() as { data: FeedbackStatus | null };

  const invalidateFeedback = () => {
    queryClient.invalidateQueries({ queryKey: ['feedback', 'ratings'] });
    queryClient.invalidateQueries({ queryKey: ['feedback', 'guidelines'] });
    queryClient.invalidateQueries({ queryKey: ['feedback', 'status'] });
  };

  const analyzeMutation = useMutation({
    mutationFn: () => fetch(`${apiBase}/api/feedback/analyze`, { method: 'POST' }),
    onSuccess: invalidateFeedback,
  });

  const clearMutation = useMutation({
    mutationFn: () => fetch(`${apiBase}/api/feedback/clear-analysis`, { method: 'POST' }),
    onSuccess: invalidateFeedback,
  });

  const deleteMutation = useMutation({
    mutationFn: (r: MessageRating) =>
      fetch(`${apiBase}/api/feedback/rate`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: r.conversationId, messageIndex: r.messageIndex }),
      }),
    onSuccess: invalidateFeedback,
  });

  const noReason = ratings.filter((r) => !r.reason).length;
  const liked = ratings.filter((r) => r.rating === 'thumbs_up').length;
  const disliked = ratings.filter((r) => r.rating === 'thumbs_down').length;
  const pending = ratings.filter((r) => !r.analyzedAt).length;

  const filtered = ratings.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return !r.analyzedAt;
    if (filter === 'no_reason') return !r.reason;
    return r.rating === filter;
  });

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
    <div className="feedback-grid">
      {/* Left: Ratings list */}
      <div>
        <div className="insights-pill-row">
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
              className={`insights-pill ${filter === key ? 'is-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="insights-empty feedback-empty">
            {ratings.length === 0
              ? 'No ratings yet. Rate agent messages with 👍/👎 to start building your feedback profile.'
              : 'No ratings match this filter.'}
          </div>
        ) : (
          <div className="feedback-list">
            {filtered.map((r) => (
              <div key={r.id} className="feedback-card">
                <button
                  onClick={() => deleteMutation.mutate(r)}
                  title="Delete rating"
                  className="feedback-delete-btn"
                >
                  ✕
                </button>
                <div className="feedback-card-header">
                  <span className="feedback-rating-icon">
                    {r.rating === 'thumbs_up' ? '👍' : '👎'}{' '}
                    <span className="feedback-agent-slug">{r.agentSlug}</span>
                  </span>
                  <span className="feedback-date">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className={`feedback-preview ${r.reason || r.analysis ? 'has-extra' : ''}`}>
                  {r.messagePreview.length > 120
                    ? `${r.messagePreview.slice(0, 120)}…`
                    : r.messagePreview}
                </div>
                {r.reason && (
                  <div className={`feedback-reason ${r.rating === 'thumbs_up' ? 'positive' : 'negative'}`}>
                    &ldquo;{r.reason}&rdquo;
                  </div>
                )}
                {r.analysis && (
                  <div className="feedback-analysis">🔍 {r.analysis}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Behavior summary */}
      <div>
        <div className="feedback-behaviors-header">
          <div className="insights-section-label">Learned Behaviors</div>
          <div className="feedback-actions">
            <button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              className={`insights-pill ${analyzeMutation.isPending ? 'is-disabled' : ''}`}
            >
              {analyzeMutation.isPending ? '⏳ Analyzing...' : '🔄 Analyze'}
            </button>
            <button onClick={() => clearMutation.mutate()} className="insights-pill">
              Clear
            </button>
          </div>
        </div>

        {status && (
          <div className="feedback-status">
            {status.isAnalyzing && <span className="feedback-status-dot" />}
            {status.lastAnalyzedAt
              ? `Last analyzed: ${relativeTime(status.lastAnalyzedAt)}${status.nextAnalysisAt ? ` · Next: ${relativeIn(status.nextAnalysisAt)}` : ''}`
              : 'Not yet analyzed'}
          </div>
        )}

        {!summary ? (
          <div className="insights-empty feedback-empty">
            No analysis yet. Rate some messages, then click Analyze or wait for
            the automatic 10-minute cycle.
          </div>
        ) : (
          <>
            <div className="feedback-behavior-section">
              <div className="feedback-behavior-heading positive">✅ Behaviors to Reinforce</div>
              {summary.reinforce.length === 0 ? (
                <div className="insights-empty">None identified yet</div>
              ) : (
                summary.reinforce.map((b, i) => (
                  <div key={i} className="feedback-behavior-item">{b}</div>
                ))
              )}
            </div>

            <div className="feedback-behavior-section">
              <div className="feedback-behavior-heading negative">❌ Behaviors to Avoid</div>
              {summary.avoid.length === 0 ? (
                <div className="insights-empty">None identified yet</div>
              ) : (
                summary.avoid.map((b, i) => (
                  <div key={i} className="feedback-behavior-item">{b}</div>
                ))
              )}
            </div>

            <div className="feedback-meta">
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
    <div className="insights-dashboard">
      <div className="insights-tab-row">
        <button
          onClick={() => setTab('usage')}
          className={`insights-tab ${tab === 'usage' ? 'is-active' : ''}`}
        >
          📊 Usage
        </button>
        <button
          onClick={() => setTab('feedback')}
          className={`insights-tab ${tab === 'feedback' ? 'is-active' : ''}`}
        >
          💬 Feedback
        </button>
      </div>
      {tab === 'usage' ? <UsageTab /> : <FeedbackTab />}
    </div>
  );
}
