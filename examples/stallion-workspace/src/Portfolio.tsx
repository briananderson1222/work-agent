import { useState, useCallback } from 'react';
import { useSendToChat, useNavigation, useWorkspaceNavigation, useAuth, useAgents, useApiBase, useOpenConversation } from '@stallion-ai/sdk';
import { useUserProfile, useMyAccounts, useAccountDetails, useAccountSpend, useSiftQueue, useCalendarEvents, useMyTasks, useMyOpportunities } from './data';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { useSortableTable, SortHeader, TableFilter } from './components/SortableTable';
import { UserDetailModal } from './UserDetailModal';
import { CRM_BASE_URL } from './constants';
import type { AccountVM } from './data';
import './workspace.css';

function DataState({ error, empty, emptyMsg, children }: { error: any; empty: boolean; emptyMsg: string; children: React.ReactNode }) {
  const qc = useQueryClient();
  if (error) {
    return (
      <div className="workspace-dashboard__empty workspace-dashboard__empty--error">
        <div>⚠ Failed to load data</div>
        <div className="workspace-dashboard__error-detail">{(error as Error)?.message || 'Unknown error'}</div>
        <button className="workspace-dashboard__retry-btn" onClick={() => qc.invalidateQueries()}>Retry</button>
      </div>
    );
  }
  if (empty) return <div className="workspace-dashboard__empty"><div>{emptyMsg}</div></div>;
  return <>{children}</>;
}

const CATEGORY_COLORS: Record<string, string> = {
  Highlight: '#10b981', Lowlight: '#f97316', Risk: '#ef4444',
  Observation: '#3b82f6', Blocker: '#ef4444', Challenge: '#f59e0b',
};

const STORAGE_KEY = 'portfolio-account-access';

function getAccessTimes(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function recordAccess(id: string) {
  const times = getAccessTimes();
  times[id] = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(times));
}

function healthBadge(score?: number) {
  if (score == null) return { label: 'No Data', color: '#6b7280' };
  if (score >= 70) return { label: 'Strong', color: '#10b981' };
  if (score >= 40) return { label: 'Monitor', color: '#f59e0b' };
  return { label: 'At Risk', color: '#ef4444' };
}

function fmt(n?: number) {
  if (n == null) return '-';
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(2)}`;
}

function AccountRow({ account, onNavigate, onExpand }: { account: AccountVM; onNavigate: (id: string) => void; onExpand: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data: details, isLoading: loadingDetails } = useAccountDetails(expanded ? account.id : null);
  const { data: spend, isLoading: loadingSpend } = useAccountSpend(expanded ? account.id : null);
  const loading = expanded && (loadingDetails || loadingSpend);
  const merged = details || account;
  const health = healthBadge(merged.healthScore);

  return (
    <tr style={{ cursor: 'pointer' }} onClick={() => { if (!expanded) { setExpanded(true); onExpand(account.id); } }}>
      <td style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <a href={`/workspaces/stallion/crm?selectedAccount=${account.id}`}
          className="workspace-dashboard__account-name"
          onClick={e => { e.preventDefault(); e.stopPropagation(); onExpand(account.id); onNavigate(account.id); }}>
          {account.name}
        </a>
      </td>
      <td style={{ color: 'var(--color-text-secondary)' }}>
        {loadingDetails ? <span className="workspace-dashboard__spinner workspace-dashboard__spinner--sm" /> : (merged.segment || '-')}
      </td>
      <td>
        {!expanded ? <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>click row</span> : loadingSpend ? <span className="workspace-dashboard__spinner workspace-dashboard__spinner--sm" /> : fmt(spend?.ytdSpend)}
      </td>
      <td>
        {loading ? <span className="workspace-dashboard__spinner workspace-dashboard__spinner--sm" /> : (
          <span className="workspace-dashboard__badge" style={{ backgroundColor: health.color }}>{health.label}</span>
        )}
      </td>
      <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <a href={`${CRM_BASE_URL}/lightning/r/Account/${account.id}/view`} target="_blank" rel="noopener noreferrer"
          className="workspace-dashboard__external-link" title="Open in Salesforce">↗</a>
      </td>
    </tr>
  );
}

export function Portfolio() {
  const { data: user, isLoading: loadingUser, error: userError } = useUserProfile();
  const { data: accounts = [], isLoading: loadingAccounts, error: accountsError } = useMyAccounts(user?.id);
  const { data: sifts = [], isLoading: loadingSifts, error: siftsError } = useSiftQueue();
  const { data: tasksResult, isLoading: loadingTasks } = useMyTasks(user?.id, 8);
  const { data: myOpps = [], isLoading: loadingOpps } = useMyOpportunities(user?.alias, 8);
  const isLoading = loadingUser || loadingAccounts;
  const nav = useNavigation();
  const { setTabState } = useWorkspaceNavigation();
  const { apiBase } = useApiBase();
  const sendToChat = useSendToChat('work-agent');
  const agents = useAgents();
  const { user: authUser } = useAuth();
  const today = new Date();
  const { data: events, error: eventsError } = useCalendarEvents(today);
  const [accessTimes, setAccessTimes] = useState(getAccessTimes);
  const [phoneLookupAlias, setPhoneLookupAlias] = useState<string | null>(null);
  const openConversation = useOpenConversation();

  // Fetch conversations across all agents, poll every 30s
  const convQueries = useQueries({
    queries: agents.map((a: any) => ({
      queryKey: ['conversations', a.slug],
      queryFn: async () => {
        const r = await fetch(`${apiBase}/agents/${a.slug}/conversations`);
        const d = await r.json();
        return (d.data || []).map((c: any) => ({ ...c, agentSlug: a.slug, agentName: a.name }));
      },
      staleTime: 15_000,
      refetchInterval: 30_000,
    })),
  });

  const recentConversations = convQueries
    .flatMap(q => q.data || [])
    .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8);

  const sortedAccounts = [...accounts].sort((a, b) => (accessTimes[b.id] || 0) - (accessTimes[a.id] || 0));

  const { sorted: filteredAccounts, filterText: accountFilter, setFilterText: setAccountFilter } =
    useSortableTable(sortedAccounts, 'name', 'asc', ['name']);

  const handleExpand = useCallback((id: string) => {
    recordAccess(id);
    setAccessTimes(getAccessTimes());
  }, []);

  const navigateToAccount = (accountId: string) => {
    recordAccess(accountId);
    setAccessTimes(getAccessTimes());
    setTabState('crm', `selectedAccount=${accountId}`);
    nav.setWorkspaceTab('stallion', 'crm');
  };

  const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const relTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const prompts = [
    { icon: '📋', label: 'Daily Briefing', desc: 'Review calendar and email priorities', msg: 'Review my calendar and email for today. Summarize priorities and action items.' },
    { icon: '🤝', label: 'Meeting Prep', desc: 'Prepare for upcoming meetings', msg: 'Prepare me for my upcoming meetings today. Research attendees and gather account context.' },
    { icon: '📝', label: 'Log Activity', desc: 'Update Salesforce with meeting notes', msg: 'Review my customer meetings and help me log activities in Salesforce.' },
    { icon: '💡', label: 'Gen Insights', desc: 'Create leadership insights (SIFTs)', msg: 'Analyze my recent activities and suggest leadership insights (SIFTs) to create.' },
  ];

  const displayName = authUser?.name?.split(' ')[0] || user?.name?.split(' ')[0] || authUser?.alias || 'there';

  return (
    <div className="workspace-dashboard__page">
      {/* Welcome */}
      <div className="workspace-dashboard__welcome">
        <span className="workspace-dashboard__welcome-greeting">
          Welcome, {displayName} {authUser?.alias && (
            <span className="workspace-dashboard__welcome-alias"
              style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
              onClick={() => setPhoneLookupAlias(authUser.alias!)}
            > ({authUser.alias}@)</span>
          )} 👋
        </span>
        <span className="workspace-dashboard__welcome-date">
          {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
      </div>

      {/* Quick actions */}
      <div className="workspace-dashboard__prompt-grid">
        {prompts.map(p => (
          <button key={p.label} onClick={() => sendToChat(p.msg)} className="workspace-dashboard__prompt-btn">
            <div className="workspace-dashboard__prompt-title">{p.icon} {p.label}</div>
            <div className="workspace-dashboard__prompt-desc">{p.desc}</div>
          </button>
        ))}
      </div>

      {/* Row 1: Accounts (wider) | Today's Meetings */}
      <div className="workspace-dashboard__grid">
        <div className="workspace-dashboard__card">
          <div className="workspace-dashboard__card-header">
            <h3 className="workspace-dashboard__card-title">
              My Accounts {!isLoading && `(${accounts.length})`}
              {isLoading && <span className="workspace-dashboard__spinner" style={{ marginLeft: 8 }} />}
            </h3>
            {accounts.length > 0 && <TableFilter value={accountFilter} onChange={setAccountFilter} placeholder="Filter accounts…" />}
          </div>
          {isLoading ? (
            <div className="workspace-dashboard__empty"><div>Loading accounts...</div></div>
          ) : accounts.length > 0 ? (
            <div className="workspace-dashboard__scroll-lg">
              <table className="workspace-dashboard__table">
                <thead><tr><th>Name</th><th>Segment</th><th>YTD</th><th>Health</th><th></th></tr></thead>
                <tbody>
                  {filteredAccounts.map(a => <AccountRow key={a.id} account={a} onNavigate={navigateToAccount} onExpand={handleExpand} />)}
                </tbody>
              </table>
            </div>
          ) : (
            <DataState error={accountsError || userError} empty={accounts.length === 0} emptyMsg="No accounts found">
              <div />
            </DataState>
          )}
        </div>

        <div className="workspace-dashboard__card">
          <div className="workspace-dashboard__card-header">
            <h3 className="workspace-dashboard__card-title">Today's Meetings ({events?.length || 0})</h3>
          </div>
          <div className="workspace-dashboard__scroll-lg workspace-dashboard__card-content">
            {eventsError ? (
              <DataState error={eventsError} empty={false} emptyMsg=""><div /></DataState>
            ) : events && events.length > 0 ? events.map(e => (
              <a key={e.id} href={`/workspaces/stallion/calendar`}
                className="workspace-dashboard__card-item workspace-dashboard__meeting-link"
                onClick={ev => {
                  ev.preventDefault();
                  setTabState('calendar', `event=${e.id}&date=${new Date(e.start).toISOString().split('T')[0]}`);
                  nav.setWorkspaceTab('stallion', 'calendar');
                }}>
                <span className="workspace-dashboard__meeting-time">{fmtTime(new Date(e.start))}</span>
                <span className="workspace-dashboard__meeting-subject">{e.subject}</span>
              </a>
            )) : (
              <div className="workspace-dashboard__empty"><div>No meetings today</div></div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Recent Opportunities | My Recent Tasks */}
      <div className="workspace-dashboard__grid--even">
        <div className="workspace-dashboard__card">
          <div className="workspace-dashboard__card-header">
            <h3 className="workspace-dashboard__card-title">
              Recent Opportunities
              {loadingOpps && <span className="workspace-dashboard__spinner" style={{ marginLeft: 8 }} />}
            </h3>
          </div>
          <div className="workspace-dashboard__scroll-sm workspace-dashboard__card-content">
            {loadingOpps ? (
              <div className="workspace-dashboard__empty"><div>Loading…</div></div>
            ) : myOpps.length > 0 ? myOpps.map(o => (
              <div key={o.id} className="workspace-dashboard__card-item">
                <div className="workspace-dashboard__card-item-title">{o.name}</div>
                <div className="workspace-dashboard__card-item-meta">
                  {o.stage} • {o.closeDate.toLocaleDateString()}
                  {o.amount != null && ` • $${o.amount.toLocaleString()}`}
                </div>
              </div>
            )) : (
              <div className="workspace-dashboard__empty"><div>No open opportunities</div></div>
            )}
          </div>
        </div>

        <div className="workspace-dashboard__card">
          <div className="workspace-dashboard__card-header">
            <h3 className="workspace-dashboard__card-title">
              My Recent Tasks
              {loadingTasks && <span className="workspace-dashboard__spinner" style={{ marginLeft: 8 }} />}
            </h3>
          </div>
          <div className="workspace-dashboard__scroll-sm workspace-dashboard__card-content">
            {loadingTasks ? (
              <div className="workspace-dashboard__empty"><div>Loading…</div></div>
            ) : tasksResult?.tasks && tasksResult.tasks.length > 0 ? tasksResult.tasks.map(t => (
              <div key={t.id} className="workspace-dashboard__card-item">
                <div className="workspace-dashboard__card-item-title">{t.subject}</div>
                <div className="workspace-dashboard__card-item-meta">
                  {t.relatedTo?.name && `${t.relatedTo.name} • `}
                  {t.dueDate ? t.dueDate.toLocaleDateString() : 'No date'}
                  {t.activityType && ` • ${t.activityType}`}
                </div>
              </div>
            )) : (
              <div className="workspace-dashboard__empty"><div>No recent tasks</div></div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Recent SIFTs | Recent Conversations */}
      <div className="workspace-dashboard__grid--even">
        <div className="workspace-dashboard__card">
          <div className="workspace-dashboard__card-header">
            <h3 className="workspace-dashboard__card-title">
              Recent SIFTs
              {loadingSifts && <span className="workspace-dashboard__spinner" style={{ marginLeft: 8 }} />}
            </h3>
          </div>
          <div className="workspace-dashboard__scroll-md workspace-dashboard__card-content">
            {loadingSifts ? (
              <div className="workspace-dashboard__empty"><div>Loading insights...</div></div>
            ) : siftsError ? (
              <DataState error={siftsError} empty={false} emptyMsg=""><div /></DataState>
            ) : sifts.length > 0 ? sifts.map(s => (
              <div key={s.id} className="workspace-dashboard__card-item" style={{ cursor: 'pointer' }}
                onClick={() => {
                  setTabState('sift-queue', `insight=${s.id}`);
                  nav.setWorkspaceTab('stallion', 'sift-queue');
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span className="workspace-dashboard__badge" style={{ backgroundColor: CATEGORY_COLORS[s.category] || '#6b7280' }}>
                    {s.category}
                  </span>
                  <div className="workspace-dashboard__card-item-title">{s.title}</div>
                </div>
                <div className="workspace-dashboard__card-item-meta">
                  {s.accountName && `${s.accountName} • `}{s.createdDate && new Date(s.createdDate).toLocaleDateString()}
                </div>
              </div>
            )) : (
              <div className="workspace-dashboard__empty"><div>No recent SIFTs</div></div>
            )}
          </div>
        </div>

        <div className="workspace-dashboard__card">
          <div className="workspace-dashboard__card-header">
            <h3 className="workspace-dashboard__card-title">Recent Conversations</h3>
          </div>
          {recentConversations.length > 0 ? (
            <div className="workspace-dashboard__scroll-md">
              <table className="workspace-dashboard__table">
                <thead><tr><th>Conversation</th><th>Agent</th><th>Last Active</th><th></th></tr></thead>
                <tbody>
                  {recentConversations.map((c: any) => (
                    <tr key={c.id}>
                      <td style={{ color: 'var(--color-text, var(--text-primary))' }}>
                        {c.title || c.id.slice(0, 12)}
                      </td>
                      <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>{c.agentName || c.agentSlug}</td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{relTime(new Date(c.updatedAt).getTime())}</td>
                      <td>
                        <button onClick={async () => {
                          const sessionId = await openConversation(c.id, c.agentSlug, c.agentName || c.agentSlug);
                          nav.setActiveChat(sessionId);
                          nav.setDockState(true);
                        }} className="workspace-dashboard__resume-btn">
                          Resume
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="workspace-dashboard__empty"><div>Start a chat to see conversations here</div></div>
          )}
        </div>
      </div>
      {phoneLookupAlias && <UserDetailModal alias={phoneLookupAlias} onClose={() => setPhoneLookupAlias(null)} />}
    </div>
  );
}
