import { useState } from 'react';
import type { AgentQuickPrompt } from '../types';
import type { AgentWorkspaceProps } from './index';

interface PullRequest {
  id: string;
  number: number;
  title: string;
  author: string;
  status: 'open' | 'approved' | 'changes-requested' | 'merged';
  files: number;
  additions: number;
  deletions: number;
  branch: string;
  description: string;
  concerns?: string[];
  checks: {
    name: string;
    status: 'success' | 'failure' | 'pending';
  }[];
}

const MOCK_PRS: PullRequest[] = [
  {
    id: 'pr-1',
    number: 247,
    title: 'Add user authentication middleware',
    author: 'sarah_dev',
    status: 'open',
    files: 8,
    additions: 342,
    deletions: 45,
    branch: 'feature/auth-middleware',
    description: 'Implements JWT-based authentication middleware with refresh token support',
    concerns: ['Missing error handling in token refresh', 'No rate limiting on auth endpoints'],
    checks: [
      { name: 'Tests', status: 'success' },
      { name: 'Lint', status: 'success' },
      { name: 'Security Scan', status: 'failure' }
    ]
  },
  {
    id: 'pr-2',
    number: 246,
    title: 'Optimize database queries',
    author: 'mike_backend',
    status: 'open',
    files: 12,
    additions: 156,
    deletions: 289,
    branch: 'perf/db-optimization',
    description: 'Reduces N+1 queries and adds proper indexing',
    concerns: ['Migration strategy not documented'],
    checks: [
      { name: 'Tests', status: 'success' },
      { name: 'Lint', status: 'success' },
      { name: 'Security Scan', status: 'success' }
    ]
  },
  {
    id: 'pr-3',
    number: 244,
    title: 'Update dependencies to latest versions',
    author: 'alex_security',
    status: 'changes-requested',
    files: 3,
    additions: 45,
    deletions: 67,
    branch: 'chore/dep-updates',
    description: 'Updates all dependencies to patch security vulnerabilities',
    concerns: ['Breaking changes in React 19 not addressed', 'Missing changelog update'],
    checks: [
      { name: 'Tests', status: 'failure' },
      { name: 'Lint', status: 'success' },
      { name: 'Security Scan', status: 'success' }
    ]
  }
];

export function CodeReviewDashboard({ agent, onLaunchPrompt, onShowChat }: AgentWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_PRS[0]?.id ?? null);
  const selectedPR = MOCK_PRS.find((pr) => pr.id === selectedId) ?? null;

  const getStatusColor = (status: PullRequest['status']) => {
    switch (status) {
      case 'approved':
        return '#22c55e';
      case 'changes-requested':
        return '#f59e0b';
      case 'merged':
        return '#8b5cf6';
      default:
        return '#3b82f6';
    }
  };

  const handleReviewPR = () => {
    if (selectedPR && onLaunchPrompt) {
      onLaunchPrompt({
        id: `review-${selectedPR.id}`,
        label: `Review PR #${selectedPR.number}`,
        prompt: `Please review Pull Request #${selectedPR.number}: "${selectedPR.title}". It has ${selectedPR.files} files changed (+${selectedPR.additions} -${selectedPR.deletions}). ${selectedPR.description}`
      });
    }
  };

  return (
    <div className="workspace-dashboard">
      <header className="workspace-dashboard__header">
        <div>
          <h2>Pull Requests Queue</h2>
          <p>Review pending pull requests • {MOCK_PRS.filter(pr => pr.status === 'open').length} open</p>
        </div>
        <div className="workspace-dashboard__actions">
          {selectedPR && (
            <button
              className="workspace-dashboard__action"
              onClick={handleReviewPR}
              type="button"
            >
              Review PR #{selectedPR.number}
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
            {MOCK_PRS.map((pr) => {
              const isActive = pr.id === selectedId;
              const failedChecks = pr.checks.filter(c => c.status === 'failure').length;
              return (
                <li
                  key={pr.id}
                  className={`workspace-dashboard__calendar-item ${isActive ? 'is-active' : ''}`}
                >
                  <button type="button" onClick={() => setSelectedId(pr.id)}>
                    <span className="workspace-dashboard__time" style={{ color: getStatusColor(pr.status) }}>
                      #{pr.number}
                    </span>
                    <span className="workspace-dashboard__title">{pr.title}</span>
                    <span className="workspace-dashboard__summary">
                      by {pr.author} • {pr.files} files • +{pr.additions} -{pr.deletions}
                      {failedChecks > 0 && ` • ${failedChecks} checks failing`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        <section className="workspace-dashboard__details">
          {selectedPR ? (
            <div className="workspace-dashboard__card">
              <h3>PR #{selectedPR.number}: {selectedPR.title}</h3>
              <p className="workspace-dashboard__details-time" style={{ color: getStatusColor(selectedPR.status) }}>
                {selectedPR.status.replace('-', ' ').toUpperCase()}
              </p>
              <p className="workspace-dashboard__details-summary">{selectedPR.description}</p>
              <p className="workspace-dashboard__details-meta">
                <strong>Author:</strong> {selectedPR.author}
              </p>
              <p className="workspace-dashboard__details-meta">
                <strong>Branch:</strong> {selectedPR.branch}
              </p>
              <p className="workspace-dashboard__details-meta">
                <strong>Changes:</strong> {selectedPR.files} files • +{selectedPR.additions} -{selectedPR.deletions}
              </p>

              <div className="workspace-dashboard__details-followups" style={{ marginTop: '1rem' }}>
                <h4>Checks</h4>
                <ul>
                  {selectedPR.checks.map((check) => (
                    <li key={check.name} style={{
                      color: check.status === 'success' ? '#22c55e' : check.status === 'failure' ? '#ef4444' : '#f59e0b'
                    }}>
                      {check.status === 'success' ? '✓' : check.status === 'failure' ? '✗' : '○'} {check.name}
                    </li>
                  ))}
                </ul>
              </div>

              {selectedPR.concerns && selectedPR.concerns.length > 0 && (
                <div className="workspace-dashboard__details-followups">
                  <h4>Potential Concerns</h4>
                  <ul>
                    {selectedPR.concerns.map((concern, idx) => (
                      <li key={idx}>{concern}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="workspace-dashboard__empty">
              <p>Select a PR to view details.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
