import { useState } from 'react';
import { useUserProfile, useMyAccounts, useAccountDetails, useAccountSpend, useSiftQueue } from './data';
import { CRM_BASE_URL } from './constants';
import type { AccountVM } from './data';
import './workspace.css';

const CATEGORY_COLORS: Record<string, string> = {
  Highlight: '#10b981', Lowlight: '#f97316', Risk: '#ef4444',
  Observation: '#3b82f6', Blocker: '#ef4444', Challenge: '#f59e0b',
};

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

const spin = { display: 'inline-block', width: 12, height: 12, border: '2px solid var(--color-border)', borderTop: '2px solid var(--color-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' };

function AccountRow({ account, onNavigate }: { account: AccountVM; onNavigate: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data: details, isLoading: loadingDetails } = useAccountDetails(expanded ? account.id : null);
  const { data: spend, isLoading: loadingSpend } = useAccountSpend(expanded ? account.id : null);
  const loading = expanded && (loadingDetails || loadingSpend);
  const merged = details || account;
  const health = healthBadge(merged.healthScore);

  return (
    <tr style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={() => setExpanded(true)}>
      <td style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <a href={`/workspaces/stallion/crm?selectedAccount=${account.id}`}
          style={{ color: 'var(--color-primary)', textDecoration: 'none', flex: 1, cursor: 'pointer' }}
          onClick={e => { e.preventDefault(); e.stopPropagation(); onNavigate(account.id); }}>
          {account.name}
        </a>
        <a href={`${CRM_BASE_URL}/lightning/r/Account/${account.id}/view`} target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: '0.875rem', flexShrink: 0 }}
          onClick={e => e.stopPropagation()} title="Open in Salesforce">
          ↗
        </a>
      </td>
      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
        {loadingDetails ? <span style={spin} /> : (merged.segment || '-')}
      </td>
      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
        {loadingDetails ? <span style={spin} /> : (merged.geo || '-')}
      </td>
      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text)', fontSize: '0.875rem' }}>
        {!expanded ? <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>click row</span> : loadingSpend ? <span style={spin} /> : fmt(spend?.ytdSpend)}
      </td>
      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text)', fontSize: '0.875rem' }}>
        {!expanded ? '-' : loadingSpend ? <span style={spin} /> : fmt(spend?.mtdSpend)}
      </td>
      <td style={{ padding: '0.5rem 0.75rem' }}>
        {loading ? <span style={spin} /> : (
          <span style={{ padding: '0.125rem 0.5rem', backgroundColor: health.color, color: 'white', borderRadius: '0.25rem', fontSize: '0.75rem' }}>
            {health.label}
          </span>
        )}
      </td>
    </tr>
  );
}

export function Portfolio() {
  const { data: user, isLoading: loadingUser } = useUserProfile();
  const { data: accounts = [], isLoading: loadingAccounts } = useMyAccounts(user?.id);
  const { data: sifts = [], isLoading: loadingSifts } = useSiftQueue();

  const thStyle = { padding: '0.5rem 0.75rem', textAlign: 'left' as const, color: 'var(--color-text-secondary)', fontSize: '0.8rem', fontWeight: 500 };
  const isLoading = loadingUser || loadingAccounts;

  const navigateToAccount = (accountId: string) => {
    const url = `/workspaces/stallion/crm?selectedAccount=${accountId}`;
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div style={{ padding: '1rem', display: 'grid', gap: '1.5rem' }}>
      {/* Accounts */}
      <div className="workspace-dashboard__card" style={{ overflow: 'visible' }}>
        <div className="workspace-dashboard__card-header">
          <h3 className="workspace-dashboard__card-title">
            My Accounts {!isLoading && `(${accounts.length})`}
            {isLoading && <span style={{ ...spin, marginLeft: 8 }} />}
          </h3>
        </div>
        {isLoading ? (
          <div className="workspace-dashboard__empty"><div>Loading accounts...</div></div>
        ) : accounts.length > 0 ? (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--color-bg, var(--bg-secondary))' }}>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Segment</th>
                  <th style={thStyle}>Geo</th>
                  <th style={thStyle}>YTD Spend</th>
                  <th style={thStyle}>MTD Spend</th>
                  <th style={thStyle}>Health</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(a => <AccountRow key={a.id} account={a} onNavigate={navigateToAccount} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="workspace-dashboard__empty"><div>No accounts found</div></div>
        )}
      </div>

      {/* Recent SIFTs */}
      <div className="workspace-dashboard__card" style={{ overflow: 'visible' }}>
        <div className="workspace-dashboard__card-header">
          <h3 className="workspace-dashboard__card-title">
            Recent SIFTs
            {loadingSifts && <span style={{ ...spin, marginLeft: 8 }} />}
          </h3>
        </div>
        <div className="workspace-dashboard__card-content">
          {loadingSifts ? (
            <div className="workspace-dashboard__empty"><div>Loading insights...</div></div>
          ) : sifts.length > 0 ? sifts.map(s => (
            <div key={s.id} className="workspace-dashboard__card-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ padding: '0.125rem 0.5rem', backgroundColor: CATEGORY_COLORS[s.category] || '#6b7280', color: 'white', borderRadius: '0.25rem', fontSize: '0.75rem' }}>
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

      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
