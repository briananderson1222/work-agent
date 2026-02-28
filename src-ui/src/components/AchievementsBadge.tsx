import { useAnalytics } from '../contexts/AnalyticsContext';
import { useAgents } from '../contexts/AgentsContext';
import './AchievementsBadge.css';

export function AchievementsBadge({ compact = false }: { compact?: boolean }) {
  const { achievements, loading, usageStats } = useAnalytics();
  const agents = useAgents();
  const hasAcp = agents.some((a: any) => a.source === 'acp');

  if (loading || !achievements.length) return null;

  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const totalCount = achievements.length;

  if (compact) {
    return (
      <div className="achievements-compact">
        <span>🏆</span>
        <span>{unlockedCount}/{totalCount}</span>
      </div>
    );
  }

  return (
    <div className="achievements-panel">
      <div className="achievements-header">
        <h3 className="achievements-title">
          <span>🏆</span>
          <span>Achievements</span>
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {hasAcp && (
            <a href="#" onClick={(e) => e.preventDefault()}
              style={{ fontSize: '12px', color: 'var(--accent-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <img src="/kiro-icon.png" alt="" width={14} height={14} style={{ borderRadius: 2 }} /> Activity Dashboard ↗
            </a>
          )}
          <div className="achievements-count">
            {unlockedCount}/{totalCount} unlocked
          </div>
        </div>
      </div>

      <div className="achievements-list">
        {achievements.map(achievement => (
          <AchievementCard key={achievement.id} achievement={achievement} />
        ))}
      </div>
    </div>
  );
}

function AchievementCard({ achievement }: { achievement: any }) {
  const progress = achievement.threshold
    ? Math.min((achievement.progress || 0) / achievement.threshold, 1)
    : 0;

  const progressPercent = Math.round(progress * 100);

  const getProgressColor = () => {
    if (progressPercent > 75) return 'var(--accent-success)';
    if (progressPercent > 50) return 'var(--accent-warning)';
    if (progressPercent > 25) return 'var(--accent-secondary)';
    return 'var(--accent-primary)';
  };

  return (
    <div className={`achievement-card ${achievement.unlocked ? 'achievement-card-unlocked' : 'achievement-card-locked'}`}>
      <div className={`achievement-icon ${achievement.unlocked ? '' : 'achievement-icon-locked'}`}>
        {achievement.unlocked ? '🏆' : '🔒'}
      </div>
      
      <div className="achievement-content">
        <div className="achievement-header">
          <div className="achievement-name">{achievement.name}</div>
          {achievement.unlocked && (
            <div className="achievement-unlocked-badge">✓ UNLOCKED</div>
          )}
        </div>
        
        <div className="achievement-description">{achievement.description}</div>

        {!achievement.unlocked && achievement.threshold && (
          <div>
            <div className="achievement-progress-header">
              <span>Progress: {progressPercent}%</span>
              <span>
                {achievement.progress?.toLocaleString()} / {achievement.threshold.toLocaleString()}
              </span>
            </div>
            <div className="achievement-progress-bar">
              <div
                className="achievement-progress-fill"
                style={{
                  backgroundColor: getProgressColor(),
                  width: `${progressPercent}%`,
                }}
              />
            </div>
          </div>
        )}

        {achievement.unlocked && achievement.unlockedAt && (
          <div className="achievement-unlocked-date">
            <span>🎉</span>
            <span>Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
