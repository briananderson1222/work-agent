import { UsageStatsPanel } from '../components/UsageStatsPanel';
import { AchievementsBadge } from '../components/AchievementsBadge';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { getInitials } from '../utils/workspace';
import './ProfilePage.css';

export function ProfilePage() {
  const { usageStats } = useAnalytics();
  const totalMessages = usageStats?.lifetime.totalMessages || 0;
  const totalCost = usageStats?.lifetime.totalCost || 0;
  
  // Get user name from environment or default
  const userName = 'Default User';
  const userInitials = getInitials(userName);

  return (
    <div className="profile-page">
      <div className="profile-container">
        {/* Hero Section */}
        <div className="profile-hero">
          <div className="profile-hero-content">
            <div className="profile-avatar">
              {userInitials}
              {totalMessages > 0 && (
                <div className="profile-avatar-badge">✓</div>
              )}
            </div>
            <div className="profile-hero-info">
              <h1 className="profile-hero-title">{userName}'s Profile</h1>
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
