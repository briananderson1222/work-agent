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
        <div className="profile-card">
          <div className="profile-card__edit-btn">
            <AuthStatusBadge expanded />
          </div>
          <div className="profile-hero-content">
            <UserIcon size={120} className="profile-card__avatar" />
            <div className="profile-hero-info">
              <div>
                <div className="profile-card__info">
                  <div className="profile-card__name-row">
                    <h1 className="profile-hero-title profile-card__name">
                      {user?.name ? (
                        <>
                          {user.name}{' '}
                          <span className="profile-card__alias">
                            (
                            <button
                              onClick={() => setShowUserLookup(true)}
                              className="profile-card__alias-btn"
                            >
                              {user.alias}
                            </button>
                            )
                          </span>
                        </>
                      ) : user?.alias ? (
                        <button
                          onClick={() => setShowUserLookup(true)}
                          className="profile-card__copy-btn"
                        >
                          {userName}
                        </button>
                      ) : (
                        userName
                      )}
                    </h1>
                    {usageStats?.lifetime.firstMessageDate && (
                      <span className="profile-card__title">
                        Joined{' '}
                        {new Date(
                          usageStats.lifetime.firstMessageDate,
                        ).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {user?.title && (
                    <span className="profile-card__detail">{user.title}</span>
                  )}
                  {user?.email && (
                    <span className="profile-card__detail--muted">
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
