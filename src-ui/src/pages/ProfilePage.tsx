import { useEffect, useState } from 'react';
import { UsageStatsPanel } from '../components/UsageStatsPanel';
import { AchievementsBadge } from '../components/AchievementsBadge';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { AuthStatusBadge } from '../components/AuthStatusBadge';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { useAuth } from '../contexts/AuthContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { UserIcon } from '../components/UserIcon';
import './ProfilePage.css';

const BADGE_COLORS: Record<string, string> = { blue: '#3b82f6', orange: '#f97316', yellow: '#eab308', red: '#ef4444', green: '#22c55e' };

function UserDetailModal({ alias, onClose, apiBase }: { alias: string; onClose: () => void; apiBase: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/agents/stallion-workspace:work-agent/tool/builder-mcp_ReadInternalWebsites`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolArgs: { inputs: [`https://phonetool.amazon.com/users/${alias}`] }, transform: 'data => data?.content?.content || data?.content || data' }),
    }).then(r => r.json()).then(d => setData(d.response)).catch(() => {}).finally(() => setLoading(false));
  }, [alias, apiBase]);

  const initials = data ? (data.name || '').split(' ').map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() : alias[0]?.toUpperCase() || '?';
  const badgeColor = BADGE_COLORS[(data?.badge_type || 'blue').toLowerCase()] || BADGE_COLORS.blue;

  return (
    <div className="user-detail-overlay" onClick={onClose}>
      <div className="user-detail-modal" onClick={e => e.stopPropagation()}>
        {loading ? <div className="user-detail-loading">Loading...</div> : !data ? <div className="user-detail-loading">Failed to load</div> : (
          <>
            <div className="user-detail-hero">
              <div className="user-detail-avatar-wrap">
                <div className="user-detail-avatar" style={{ border: `3px solid ${badgeColor}` }}>
                  <span className="user-detail-avatar-initial">{initials}</span>
                </div>
                <span className="user-detail-badge-pill" style={{ background: badgeColor }}>{data.badge_type || 'blue'}</span>
              </div>
              <div className="user-detail-hero-info">
                <div className="user-detail-name">{data.name}</div>
                <div className="user-detail-alias">{data.login}@</div>
                {data.job_title && <div className="user-detail-subtitle">{data.job_title}{data.job_level ? ` · L${data.job_level}` : ''}</div>}
              </div>
              <button onClick={onClose} className="user-detail-close-btn">✕</button>
            </div>
            <div className="user-detail-body">
              {data.department_name && <div className="user-detail-row"><span className="user-detail-label">Team</span><span>{data.department_name}</span></div>}
              {data.building && <div className="user-detail-row"><span className="user-detail-label">Location</span><span>{data.building}{data.city ? `, ${data.city}` : ''}</span></div>}
              {data.manager?.login && <div className="user-detail-row"><span className="user-detail-label">Manager</span><a href={`https://phonetool.amazon.com/users/${data.manager.login}`} target="_blank" rel="noopener noreferrer" className="user-detail-link">{data.manager.login}@</a></div>}
              {data.email && <div className="user-detail-row"><span className="user-detail-label">Email</span><a href={`mailto:${data.email}`} className="user-detail-link">{data.email}</a></div>}
              {data.total_tenure_formatted && <div className="user-detail-row"><span className="user-detail-label">Tenure</span><span>{data.total_tenure_formatted}</span></div>}
              <div className="user-detail-tags">
                {data.is_manager && <span className="user-detail-tag">👔 Manager</span>}
                {data.bar_raiser && <span className="user-detail-tag">⭐ Bar Raiser</span>}
              </div>
            </div>
            <div className="user-detail-footer">
              <a href={`https://phonetool.amazon.com/users/${alias}`} target="_blank" rel="noopener noreferrer" className="user-detail-link">Open in Phonetool →</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { usageStats, refresh } = useAnalytics();
  const { status: authStatus, user } = useAuth();
  const { apiBase } = useApiBase();
  const userName = user?.name || user?.alias || 'User';
  const profileUrl = user?.profileUrl;
  const totalMessages = usageStats?.lifetime.totalMessages || 0;
  const totalCost = usageStats?.lifetime.totalCost || 0;
  const [showPhoneLookup, setShowPhoneLookup] = useState(false);

  // Refresh analytics when profile page loads
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="profile-page">
      <div className="profile-container">
        {/* Hero Section */}
        <div className="profile-hero" style={{ position: 'relative' }}>
          {/* Auth status */}
          <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
            <AuthStatusBadge expanded />
          </div>
          <div className="profile-hero-content">
            <UserIcon size={120} style={{ fontSize: '3rem', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)' }} />
            <div className="profile-hero-info">
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: user?.title ? '12px' : '0' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                    <h1 className="profile-hero-title" style={{ margin: 0 }}>
                      {user?.name ? (
                        <>{user.name} <span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--text-secondary)' }}>(<button
                          onClick={() => setShowPhoneLookup(true)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 'inherit', padding: 0, textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                        >{user.alias}@</button>)</span></>
                      ) : profileUrl ? (
                        <button onClick={() => setShowPhoneLookup(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 'inherit', padding: 0 }}>{userName}@</button>
                      ) : <>{userName}</>}
                    </h1>
                    {usageStats?.lifetime.firstMessageDate && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Joined {new Date(usageStats.lifetime.firstMessageDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {user?.title && <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{user.title}</span>}
                  {user?.email && <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{user.email}</span>}
                </div>
              </div>
              <p className="profile-hero-subtitle">
                {totalMessages === 0 ? 'Start your journey with your first message' : 
                 totalMessages === 1 ? '🎉 You\'ve sent your first message!' :
                 totalMessages < 10 ? `${totalMessages} messages sent - you're getting started!` :
                 totalMessages < 100 ? `${totalMessages} messages - you're on a roll!` :
                 `${totalMessages} messages - power user! 🚀`}
              </p>
              {totalCost > 0 && (
                <div className="profile-hero-badges">
                  <div className="profile-badge profile-badge-primary">
                    💰 ${totalCost.toFixed(2)} spent
                  </div>
                  <div className="profile-badge profile-badge-secondary">
                    📊 ${(totalCost / Math.max(totalMessages, 1)).toFixed(4)}/msg
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="profile-stats-grid">
          <div className="profile-card">
            <UsageStatsPanel />
          </div>

          <div className="profile-card">
            <AchievementsBadge />
          </div>
        </div>

        {/* Activity Timeline */}
        {totalMessages > 0 && (
          <div className="profile-timeline">
            <h3 className="profile-timeline-title">📈 Activity History</h3>
            <ActivityTimeline />
          </div>
        )}
      </div>
      {showPhoneLookup && user?.alias && (
        <UserDetailModal alias={user.alias} onClose={() => setShowPhoneLookup(false)} apiBase={apiBase} />
      )}
    </div>
  );
}
