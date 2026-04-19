import type { MonitoringStats } from '../../contexts/MonitoringContext';

export function MonitoringHeader({
  stats,
  connectionStatus,
  children,
}: {
  stats: MonitoringStats | null;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  children: React.ReactNode;
}) {
  return (
    <div className="monitoring-header">
      <div className="monitoring-title">
        <h1>Monitoring</h1>
        <div
          className="status-badge"
          aria-label={`Monitoring connection ${connectionStatus}`}
          title={`Monitoring connection ${connectionStatus}`}
        >
          <span className={`status-dot status-dot-${connectionStatus}`}></span>
        </div>
      </div>

      <div className="monitoring-stats">
        <div className="stat-item">
          <span className="stat-label">Active:</span>
          <span className="stat-value">{stats?.summary.activeAgents || 0}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Running:</span>
          <span className="stat-value">
            {stats?.summary.runningAgents || 0}
          </span>
        </div>
      </div>

      <div className="monitoring-actions">{children}</div>
    </div>
  );
}
