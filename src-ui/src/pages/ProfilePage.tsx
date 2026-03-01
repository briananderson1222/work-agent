import { useEffect, useState } from 'react';
import { AchievementsBadge } from '../components/AchievementsBadge';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { AuthStatusBadge } from '../components/AuthStatusBadge';
import { UsageStatsPanel } from '../components/UsageStatsPanel';
import { UserDetailModal } from '../components/UserDetailModal';
import { UserIcon } from '../components/UserIcon';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { useAuth } from '../contexts/AuthContext';
import './ProfilePage.css';

export function ProfilePage() {
  const { usageStats, refresh } = useAnalytics();
  const { user } = useAuth();
  const userName = user?.name || user?.alias || 'User';
  const totalMessages = usageStats?.lifetime.totalMessages || 0;
  const totalCost = usageStats?.lifetime.totalCost || 0;
  const [showUserLookup, setShowUserLookup] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="profile-page">
      <div className="profile-container">
        <div className="profile-hero" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
            <AuthStatusBadge expanded />
          </div>
          <div className="profile-hero-content">
            <UserIcon
              size={120}
              style={{
                fontSize: '3rem',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
              }}
            />
            <div className="profile-hero-info">
              <div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    marginBottom: user?.title ? '12px' : '0',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '12px',
                    }}
                  >
                    <h1 className="profile-hero-title" style={{ margin: 0 }}>
                      {user?.name ? (
                        <>
                          {user.name}{' '}
                          <span
                            style={{
                              fontSize: '14px',
                              fontWeight: 400,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            (
                            <button
                              onClick={() => setShowUserLookup(true)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-secondary)',
                                fontSize: 'inherit',
                                padding: 0,
                                textDecoration: 'underline',
                                textDecorationStyle: 'dotted',
                              }}
                            >
                              {user.alias}
                            </button>
                            )
                          </span>
                        </>
                      ) : user?.alias ? (
                        <button
                          onClick={() => setShowUserLookup(true)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'inherit',
                            fontSize: 'inherit',
                            padding: 0,
                          }}
                        >
                          {userName}
                        </button>
                      ) : (
                        userName
                      )}
                    </h1>
                    {usageStats?.lifetime.firstMessageDate && (
                      <span
                        style={{ fontSize: '12px', color: 'var(--text-muted)' }}
                      >
                        Joined{' '}
                        {new Date(
                          usageStats.lifetime.firstMessageDate,
                        ).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {user?.title && (
                    <span
                      style={{
                        fontSize: '14px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {user.title}
                    </span>
                  )}
                  {user?.email && (
                    <span
                      style={{ fontSize: '13px', color: 'var(--text-muted)' }}
                    >
                      {user.email}
                    </span>
                  )}
                </div>
              </div>
              <p className="profile-hero-subtitle">
                {totalMessages === 0
                  ? 'Start your journey with your first message'
                  : totalMessages === 1
                    ? "🎉 You've sent your first message!"
                    : totalMessages < 10
                      ? `${totalMessages} messages sent - you're getting started!`
                      : totalMessages < 100
                        ? `${totalMessages} messages - you're on a roll!`
                        : `${totalMessages} messages - power user! 🚀`}
              </p>
              {totalCost > 0 && (
                <div className="profile-hero-badges">
                  <div className="profile-badge profile-badge-primary">
                    💰 ${totalCost.toFixed(2)} spent
                  </div>
                  <div className="profile-badge profile-badge-secondary">
                    📊 ${(totalCost / Math.max(totalMessages, 1)).toFixed(4)}
                    /msg
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="profile-stats-grid">
          <div className="profile-card">
            <UsageStatsPanel />
          </div>
          <div className="profile-card">
            <AchievementsBadge />
          </div>
        </div>

        {totalMessages > 0 && (
          <div className="profile-timeline">
            <h3 className="profile-timeline-title">📈 Activity History</h3>
            <ActivityTimeline />
          </div>
        )}
      </div>
      {showUserLookup && user?.alias && (
        <UserDetailModal
          alias={user.alias}
          onClose={() => setShowUserLookup(false)}
        />
      )}
    </div>
  );
}
