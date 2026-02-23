import { useState, useCallback, useEffect } from 'react';
import { useSendToChat, useConversations, useNavigation, useWorkspaceNavigation } from '@stallion-ai/sdk';
import { useUserProfile, useMyAccounts, useAccountDetails, useAccountSpend, useSiftQueue, useCalendarEvents } from './data';
import { CRM_BASE_URL } from './constants';
import type { AccountVM } from './data';
import './workspace.css';

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

  const handleExpand = () => {
    if (!expanded) {
      setExpanded(true);
      onExpand(account.id);
    }
  };

  return (
    <tr style={{ cursor: 'pointer' }} onClick={handleExpand}>
      <td className="portfolio-account-cell">
        <a href={`/workspaces/stallion/crm?selectedAccount=${account.id}`}
          className="workspace-dashboard__account-name"
          onClick={e => { e.preventDefault(); e.stopPropagation(); onNavigate(account.id); }}>
          {account.name}
        </a>
        <a href={`${CRM_BASE_URL}/lightning/r/Account/${account.id}/view`} target="_blank" rel="noopener noreferrer"
          className="workspace-dashboard__sfdc-link" onClick={e => e.stopPropagation()} title="Open in Salesforce">
          ↗
        </a>
      </td>
      <td className="portfolio-account-meta">
        {loadingDetails ? <span className="workspace-dashboard__spinner workspace-dashboard__spinner--sm" /> : (merged.segment || '-')}
      </td>
      <td className="portfolio-account-meta">
        {loadingDetails ? <span className="workspace-dashboard__spinner workspace-dashboard__spinner--sm" /> : (merged.geo || '-')}
      </td>
      <td>
        {!expanded ? <span className="portfolio-expand-hint">click row</span> : loadingSpend ? <span className="workspace-dashboard__spinner workspace-dashboard__spinner--sm" /> : fmt(spend?.ytdSpend)}
      </td>
      <td>
        {!expanded ? '-' : loadingSpend ? <span className="workspace-dashboard__spinner workspace-dashboard__spinner--sm" /> : fmt(spend?.mtdSpend)}
      </td>
      <td>
        {loading ? <span className="workspace-dashboard__spinner workspace-dashboard__spinner--sm" /> : (
          <span className="workspace-dashboard__badge" style={{ backgroundColor: health.color }}>{health.label}</span>
        )}
      </td>
    </tr>
  );
}

type ConversationItem = { id: string; title?: string; lastMessage?: string; updatedAt?: number; messageCount?: number };

export function Portfolio() {
  const { data: user, isLoading: loadingUser } = useUserProfile();
  const { data: accounts = [], isLoading: loadingAccounts } = useMyAccounts(user?.id);
  const { data: sifts = [], isLoading: loadingSifts } = useSiftQueue();
  const isLoading = loadingUser || loadingAccounts;
  const nav = useNavigation();
  const { setTabState } = useWorkspaceNavigation();
  const sendToChat = useSendToChat('work-agent');
  const conversations = useConversations('work-agent') as ConversationItem[];
  const today = new Date();
  const { data: events } = useCalendarEvents(today);

  const [accessTimes, setAccessTimes] = useState(getAccessTimes);

  const sortedAccounts = [...accounts].sort((a, b) => {
    const ta = accessTimes[a.id] || 0;
    const tb = accessTimes[b.id] || 0;
    return tb - ta; // most recent first, unaccessed stay at bottom
  });

  const handleExpand = useCallback((id: string) => {
    recordAccess(id);
    setAccessTimes(getAccessTimes());
  }, []);

  const navigateToAccount = (accountId: string) => {
    const params = new URLSearchParams();
    params.set('selectedAccount', accountId);
    setTabState('crm', params.toString());
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

  const recentConversations = (conversations || [])
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 5);

  const prompts = [
    { title: '📋 Daily Briefing', desc: 'Review calendar and email priorities', msg: 'Review my calendar and email for today. Summarize priorities and action items.' },
    { title: '🤝 Meeting Prep', desc: 'Prepare for upcoming meetings', msg: 'Prepare me for my upcoming meetings today. Research attendees and gather account context.' },
    { title: '📝 Log Activity', desc: 'Update Salesforce with meeting notes', msg: 'Review my customer meetings and help me log activities in Salesforce.' },
    { title: '💡 Generate Insights', desc: 'Create leadership insights (SIFTs)', msg: 'Analyze my recent activities and suggest leadership insights (SIFTs) to create.' },
  ];

  return (
    <div className="workspace-dashboard__page">
      {/* Quick Actions */}
      <div className="workspace-dashboard__prompt-grid">
        {prompts.map(p => (
          <button key={p.title} onClick={() => sendToChat(p.msg)} className="workspace-dashboard__prompt-btn">
            <div className="workspace-dashboard__prompt-title">{p.title}</div>
            <div className="workspace-dashboard__prompt-desc">{p.desc}</div>
          </button>
        ))}
      </div>

      {/* Today's Meetings + Recent Conversations side by side */}
      <div className="workspace-dashboard__row">
        <div className="workspace-dashboard__card workspace-dashboard__card--half">
          <div className="workspace-dashboard__card-header">
            <h3 className="workspace-dashboard__card-title">Today's Meetings ({events?.length || 0})</h3>
          </div>
          <div className="workspace-dashboard__scroll-sm workspace-dashboard__card-content">
            {events && events.length > 0 ? events.map(e => (
              <a key={e.id} href={`/workspaces/stallion/calendar`}
                className="workspace-dashboard__card-item workspace-dashboard__meeting-link"
                onClick={ev => {
                  ev.preventDefault();
                  const params = new URLSearchParams();
                  params.set('event', e.id);
                  params.set('date', new Date(e.start).toISOString().split('T')[0]);
                  setTabState('calendar', params.toString());
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

        <div className="workspace-dashboard__card workspace-dashboard__card--half">
          <div className="workspace-dashboard__card-header">
            <h3 className="workspace-dashboard__card-title">Recent Conversations</h3>
          </div>
          {recentConversations.length > 0 ? (
            <div className="workspace-dashboard__scroll-sm">
              <table className="workspace-dashboard__table">
                <thead><tr><th>Conversation</th><th>Last Active</th><th></th></tr></thead>
                <tbody>
                  {recentConversations.map(c => (
                    <tr key={c.id}>
                      <td className="portfolio-conversation-cell">
                        {c.title || c.lastMessage?.slice(0, 50) || c.id.slice(0, 8)}
                      </td>
                      <td className="portfolio-conversation-meta">{c.updatedAt ? relTime(c.updatedAt) : '-'}</td>
                      <td>
                        <button onClick={() => { nav.setDockState(true); nav.setActiveChat(c.id); }} className="workspace-dashboard__resume-btn">
                          Resume
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="workspace-dashboard__empty"><div>No conversations yet</div></div>
          )}
        </div>
      </div>

      {/* Accounts */}
      <div className="workspace-dashboard__card">
        <div className="workspace-dashboard__card-header">
          <h3 className="workspace-dashboard__card-title">
            My Accounts {!isLoading && `(${accounts.length})`}
            {isLoading && <span className="workspace-dashboard__spinner portfolio-spinner-margin" />}
          </h3>
        </div>
        {isLoading ? (
          <div className="workspace-dashboard__empty"><div>Loading accounts...</div></div>
        ) : accounts.length > 0 ? (
          <div className="workspace-dashboard__scroll-lg">
            <table className="workspace-dashboard__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Segment</th>
                  <th>Geo</th>
                  <th>YTD Spend</th>
                  <th>MTD Spend</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                {sortedAccounts.map(a => <AccountRow key={a.id} account={a} onNavigate={navigateToAccount} onExpand={handleExpand} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="workspace-dashboard__empty"><div>No accounts found</div></div>
        )}
      </div>

      {/* Recent SIFTs */}
      <div className="workspace-dashboard__card">
        <div className="workspace-dashboard__card-header">
          <h3 className="workspace-dashboard__card-title">
            Recent SIFTs
            {loadingSifts && <span className="workspace-dashboard__spinner portfolio-spinner-margin" />}
          </h3>
        </div>
        <div className="workspace-dashboard__scroll-md workspace-dashboard__card-content">
          {loadingSifts ? (
            <div className="workspace-dashboard__empty"><div>Loading insights...</div></div>
          ) : sifts.length > 0 ? sifts.map(s => (
            <div key={s.id} className="workspace-dashboard__card-item">
              <div className="portfolio-sift-item">
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
    </div>
  );
}
