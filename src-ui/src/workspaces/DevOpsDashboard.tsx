import { useState } from 'react';
import type { AgentQuickPrompt } from '../types';
import type { AgentWorkspaceProps } from './index';

interface ServiceStatus {
  id: string;
  name: string;
  environment: 'production' | 'staging' | 'development';
  status: 'healthy' | 'degraded' | 'down';
  uptime: string;
  version: string;
  lastDeployment: string;
  metrics: {
    cpu: number;
    memory: number;
    requests: string;
    errors: string;
  };
  incidents?: string[];
  recentChanges?: string[];
  suggestedAction?: AgentQuickPrompt;
}

const MOCK_SERVICES: ServiceStatus[] = [
  {
    id: 'api-prod',
    name: 'API Server',
    environment: 'production',
    status: 'healthy',
    uptime: '99.98%',
    version: 'v2.1.4',
    lastDeployment: '2 hours ago',
    metrics: {
      cpu: 45,
      memory: 62,
      requests: '1.2k/min',
      errors: '0.01%'
    },
    recentChanges: ['Deployed v2.1.4 with performance improvements', 'Scaled to 6 replicas']
  },
  {
    id: 'db-prod',
    name: 'PostgreSQL Database',
    environment: 'production',
    status: 'healthy',
    uptime: '99.99%',
    version: 'v14.8',
    lastDeployment: '1 week ago',
    metrics: {
      cpu: 32,
      memory: 78,
      requests: '3.5k/min',
      errors: '0%'
    }
  },
  {
    id: 'cache-prod',
    name: 'Redis Cache',
    environment: 'production',
    status: 'degraded',
    uptime: '98.5%',
    version: 'v7.0.11',
    lastDeployment: '3 days ago',
    metrics: {
      cpu: 78,
      memory: 91,
      requests: '8.2k/min',
      errors: '2.3%'
    },
    incidents: ['High memory usage - approaching limit', 'Intermittent connection timeouts'],
    suggestedAction: {
      id: 'investigate-redis',
      label: 'Investigate Redis',
      prompt: 'Redis cache is showing degraded performance with high memory usage (91%) and connection timeouts. Analyze the issue and suggest remediation steps.'
    }
  },
  {
    id: 'worker-prod',
    name: 'Background Workers',
    environment: 'production',
    status: 'healthy',
    uptime: '99.95%',
    version: 'v2.1.3',
    lastDeployment: '1 day ago',
    metrics: {
      cpu: 52,
      memory: 48,
      requests: '450/min',
      errors: '0.1%'
    }
  },
  {
    id: 'api-staging',
    name: 'API Server',
    environment: 'staging',
    status: 'down',
    uptime: '0%',
    version: 'v2.2.0-rc1',
    lastDeployment: '10 minutes ago',
    metrics: {
      cpu: 0,
      memory: 0,
      requests: '0/min',
      errors: '100%'
    },
    incidents: ['Deployment failed - container crash loop', 'Health check failing'],
    suggestedAction: {
      id: 'fix-staging-deployment',
      label: 'Fix Staging Deploy',
      prompt: 'Staging API deployment is failing with container crash loop. The version v2.2.0-rc1 was deployed 10 minutes ago. Check logs and identify the issue.'
    }
  }
];

export function DevOpsDashboard({ agent, onLaunchPrompt, onShowChat }: AgentWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_SERVICES[0]?.id ?? null);
  const selectedService = MOCK_SERVICES.find((svc) => svc.id === selectedId) ?? null;

  const getStatusColor = (status: ServiceStatus['status']) => {
    switch (status) {
      case 'healthy':
        return '#22c55e';
      case 'degraded':
        return '#f59e0b';
      case 'down':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getEnvironmentBadge = (env: ServiceStatus['environment']) => {
    switch (env) {
      case 'production':
        return '🔴 PROD';
      case 'staging':
        return '🟡 STAGING';
      case 'development':
        return '🟢 DEV';
      default:
        return env;
    }
  };

  const getMetricColor = (value: number, type: 'cpu' | 'memory') => {
    if (value >= 90) return '#ef4444';
    if (value >= 75) return '#f59e0b';
    return '#22c55e';
  };

  const handleSuggestedAction = () => {
    if (selectedService?.suggestedAction && onLaunchPrompt) {
      onLaunchPrompt(selectedService.suggestedAction);
    }
  };

  const criticalCount = MOCK_SERVICES.filter(svc => svc.status === 'down').length;
  const warningCount = MOCK_SERVICES.filter(svc => svc.status === 'degraded').length;

  return (
    <div className="workspace-dashboard">
      <header className="workspace-dashboard__header">
        <div>
          <h2>Infrastructure Status</h2>
          <p>Monitor services and deployments •
            {criticalCount > 0 && ` ${criticalCount} critical`}
            {warningCount > 0 && ` ${warningCount} warning`}
            {criticalCount === 0 && warningCount === 0 && ' All systems operational'}
          </p>
        </div>
        <div className="workspace-dashboard__actions">
          {selectedService?.suggestedAction && (
            <button
              className="workspace-dashboard__action"
              onClick={handleSuggestedAction}
              type="button"
            >
              {selectedService.suggestedAction.label}
            </button>
          )}
          <button className="workspace-dashboard__action" onClick={() => onShowChat?.()} type="button">
            Open Chat Dock
          </button>
        </div>
      </header>
      <div className="workspace-dashboard__content">
        <aside className="workspace-dashboard__calendar">
          <ul>
            {MOCK_SERVICES.map((svc) => {
              const isActive = svc.id === selectedId;
              return (
                <li
                  key={svc.id}
                  className={`workspace-dashboard__calendar-item ${isActive ? 'is-active' : ''}`}
                >
                  <button type="button" onClick={() => setSelectedId(svc.id)}>
                    <span className="workspace-dashboard__time" style={{ color: getStatusColor(svc.status) }}>
                      {svc.status === 'healthy' ? '✓' : svc.status === 'down' ? '✗' : '⚠'}
                    </span>
                    <span className="workspace-dashboard__title">{svc.name}</span>
                    <span className="workspace-dashboard__summary">
                      {getEnvironmentBadge(svc.environment)} • {svc.version} • {svc.uptime} uptime
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        <section className="workspace-dashboard__details">
          {selectedService ? (
            <div className="workspace-dashboard__card">
              <h3>{selectedService.name}</h3>
              <p className="workspace-dashboard__details-time" style={{ color: getStatusColor(selectedService.status) }}>
                {selectedService.status.toUpperCase()} • {getEnvironmentBadge(selectedService.environment)}
              </p>
              <p className="workspace-dashboard__details-meta">
                <strong>Version:</strong> {selectedService.version}
              </p>
              <p className="workspace-dashboard__details-meta">
                <strong>Uptime:</strong> {selectedService.uptime}
              </p>
              <p className="workspace-dashboard__details-meta">
                <strong>Last Deployment:</strong> {selectedService.lastDeployment}
              </p>

              <div className="workspace-dashboard__details-followups" style={{ marginTop: '1rem' }}>
                <h4>Metrics</h4>
                <ul>
                  <li style={{ color: getMetricColor(selectedService.metrics.cpu, 'cpu') }}>
                    CPU: {selectedService.metrics.cpu}%
                  </li>
                  <li style={{ color: getMetricColor(selectedService.metrics.memory, 'memory') }}>
                    Memory: {selectedService.metrics.memory}%
                  </li>
                  <li>Requests: {selectedService.metrics.requests}</li>
                  <li style={{ color: selectedService.metrics.errors === '0%' ? '#22c55e' : '#f59e0b' }}>
                    Error Rate: {selectedService.metrics.errors}
                  </li>
                </ul>
              </div>

              {selectedService.incidents && selectedService.incidents.length > 0 && (
                <div className="workspace-dashboard__details-followups">
                  <h4>Active Incidents</h4>
                  <ul style={{ color: '#ef4444' }}>
                    {selectedService.incidents.map((incident, idx) => (
                      <li key={idx}>⚠ {incident}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedService.recentChanges && selectedService.recentChanges.length > 0 && (
                <div className="workspace-dashboard__details-followups">
                  <h4>Recent Changes</h4>
                  <ul>
                    {selectedService.recentChanges.map((change, idx) => (
                      <li key={idx}>{change}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="workspace-dashboard__empty">
              <p>Select a service to view details.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
