import { useEffect } from 'react';
import { UsageStatsPanel } from '../components/UsageStatsPanel';
import { AchievementsBadge } from '../components/AchievementsBadge';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { useAuth } from '../contexts/AuthContext';
import { getInitials, getUserIconStyle } from '../utils/workspace';
import './ProfilePage.css';

export function ProfilePage() {
  const { usageStats, refresh } = useAnalytics();
  const { status: authStatus, expiresAt, renew, isRenewing, provider, user } = useAuth();
  const userName = user?.alias || 'User';
  const profileUrl = user?.profileUrl;
  const totalMessages = usageStats?.lifetime.totalMessages || 0;
  const totalCost = usageStats?.lifetime.totalCost || 0;
  
  const userName = user?.alias || 'User';
  const userInitials = getInitials(userName);

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
          {/* Auth status — upper right, stacked */}
          <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              fontSize: '13px', padding: '6px 12px', borderRadius: '6px',
              background: authStatus === 'valid' ? '#22c55e15' : authStatus === 'expiring' ? '#f59e0b15' : '#ef444415',
              border: `1px solid ${authStatus === 'valid' ? '#22c55e30' : authStatus === 'expiring' ? '#f59e0b30' : '#ef444430'}`,
              color: authStatus === 'valid' ? '#22c55e' : authStatus === 'expiring' ? '#f59e0b' : '#ef4444',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} />
              🔐 {provider} — {authStatus === 'valid' || authStatus === 'expiring'
                ? `expires ${expiresAt?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                : authStatus || 'unknown'}
            </span>
            <button onClick={renew} disabled={isRenewing}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '6px 12px', fontSize: '12px', fontWeight: 500,
                background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
                borderRadius: '6px', cursor: isRenewing ? 'wait' : 'pointer', color: 'var(--text-primary)',
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
              </svg>
              {isRenewing ? 'Opening...' : 'Renew'}
            </button>
          </div>
          <div className="profile-hero-content">
            <div style={{
              ...getUserIconStyle({ name: userName }, 120),
              fontSize: '3rem',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
            }}>
              {userInitials}
            </div>
            <div className="profile-hero-info">
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                  <h1 className="profile-hero-title" style={{ margin: 0 }}>
                    {userName}{profileUrl ? (
                      <a href={profileUrl} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '14px', color: 'var(--text-secondary)', textDecoration: 'none', marginLeft: '4px', fontWeight: 400 }}>@</a>
                    ) : null}
                  </h1>
                  {usageStats?.lifetime.firstMessageDate && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Joined {new Date(usageStats.lifetime.firstMessageDate).toLocaleDateString()}
                    </span>
                  )}
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

        {/* Activity Timeline Placeholder */}
        {totalMessages > 0 && (
          <div className="profile-timeline">
            <h3 className="profile-timeline-title">📈 Activity Timeline</h3>
            <div className="profile-timeline-placeholder">
              <div className="profile-timeline-icon">📊</div>
              <p>Activity timeline coming soon</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
