import { useState } from 'react';
import type { AgentQuickPrompt } from '../types';
import type { AgentWorkspaceProps } from './index';

interface DocItem {
  id: string;
  title: string;
  type: 'api' | 'guide' | 'architecture' | 'readme' | 'changelog';
  status: 'up-to-date' | 'needs-update' | 'missing';
  lastUpdated: string;
  description: string;
  sections?: string[];
  missingInfo?: string[];
  suggestedPrompt?: AgentQuickPrompt;
}

const MOCK_DOCS: DocItem[] = [
  {
    id: 'api-reference',
    title: 'API Reference',
    type: 'api',
    status: 'needs-update',
    lastUpdated: '2 weeks ago',
    description: 'REST API documentation for all public endpoints',
    sections: ['Authentication', 'User Management', 'Data Models', 'Error Handling'],
    missingInfo: ['New webhook endpoints added in v2.1', 'Rate limiting documentation'],
    suggestedPrompt: {
      id: 'update-api-docs',
      label: 'Update API Docs',
      prompt: 'Update the API documentation to include the new webhook endpoints from v2.1 and document the rate limiting policies.'
    }
  },
  {
    id: 'getting-started',
    title: 'Getting Started Guide',
    type: 'guide',
    status: 'up-to-date',
    lastUpdated: '3 days ago',
    description: 'Quick start guide for new users',
    sections: ['Installation', 'Configuration', 'First Steps', 'Examples']
  },
  {
    id: 'architecture',
    title: 'System Architecture',
    type: 'architecture',
    status: 'needs-update',
    lastUpdated: '1 month ago',
    description: 'High-level system design and component overview',
    sections: ['Service Architecture', 'Data Flow', 'Security Model', 'Scalability'],
    missingInfo: ['New microservice architecture migration', 'Updated deployment diagram'],
    suggestedPrompt: {
      id: 'update-arch-docs',
      label: 'Update Architecture',
      prompt: 'Document the migration to microservices architecture. Include updated service diagrams, data flow, and deployment architecture.'
    }
  },
  {
    id: 'readme',
    title: 'Project README',
    type: 'readme',
    status: 'up-to-date',
    lastUpdated: '1 week ago',
    description: 'Main project README with overview and links',
    sections: ['Overview', 'Installation', 'Usage', 'Contributing', 'License']
  },
  {
    id: 'changelog',
    title: 'Changelog',
    type: 'changelog',
    status: 'missing',
    lastUpdated: 'Never',
    description: 'Version history and release notes',
    missingInfo: ['No changelog exists - needs to be created'],
    suggestedPrompt: {
      id: 'create-changelog',
      label: 'Create Changelog',
      prompt: 'Create a comprehensive changelog starting from v1.0.0. Review git history and organize changes by version with Added, Changed, Fixed, and Deprecated categories.'
    }
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting Guide',
    type: 'guide',
    status: 'needs-update',
    lastUpdated: '2 months ago',
    description: 'Common issues and solutions',
    sections: ['Installation Issues', 'Configuration Problems', 'Performance Issues'],
    missingInfo: ['Docker-related issues', 'Database migration errors'],
    suggestedPrompt: {
      id: 'update-troubleshooting',
      label: 'Update Troubleshooting',
      prompt: 'Add troubleshooting sections for Docker deployment issues and database migration errors based on recent support tickets.'
    }
  }
];

export function DocumentationDashboard({ agent, onLaunchPrompt, onShowChat }: AgentWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_DOCS[0]?.id ?? null);
  const selectedDoc = MOCK_DOCS.find((doc) => doc.id === selectedId) ?? null;

  const getStatusColor = (status: DocItem['status']) => {
    switch (status) {
      case 'up-to-date':
        return '#22c55e';
      case 'needs-update':
        return '#f59e0b';
      case 'missing':
        return '#ef4444';
      default:
        return '#3b82f6';
    }
  };

  const getTypeIcon = (type: DocItem['type']) => {
    switch (type) {
      case 'api':
        return '🔌';
      case 'guide':
        return '📖';
      case 'architecture':
        return '🏗️';
      case 'readme':
        return '📄';
      case 'changelog':
        return '📝';
      default:
        return '📋';
    }
  };

  const handleSuggestedPrompt = () => {
    if (selectedDoc?.suggestedPrompt && onLaunchPrompt) {
      onLaunchPrompt(selectedDoc.suggestedPrompt);
    }
  };

  const needsAttention = MOCK_DOCS.filter(doc => doc.status !== 'up-to-date').length;

  return (
    <div className="workspace-dashboard">
      <header className="workspace-dashboard__header">
        <div>
          <h2>Documentation Status</h2>
          <p>Track and maintain project documentation • {needsAttention} items need attention</p>
        </div>
        <div className="workspace-dashboard__actions">
          {selectedDoc?.suggestedPrompt && (
            <button
              className="workspace-dashboard__action"
              onClick={handleSuggestedPrompt}
              type="button"
            >
              {selectedDoc.suggestedPrompt.label}
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
            {MOCK_DOCS.map((doc) => {
              const isActive = doc.id === selectedId;
              return (
                <li
                  key={doc.id}
                  className={`workspace-dashboard__calendar-item ${isActive ? 'is-active' : ''}`}
                >
                  <button type="button" onClick={() => setSelectedId(doc.id)}>
                    <span className="workspace-dashboard__time" style={{ color: getStatusColor(doc.status) }}>
                      {getTypeIcon(doc.type)} {doc.status === 'up-to-date' ? '✓' : doc.status === 'missing' ? '✗' : '⚠'}
                    </span>
                    <span className="workspace-dashboard__title">{doc.title}</span>
                    <span className="workspace-dashboard__summary">
                      {doc.status.replace('-', ' ')} • {doc.lastUpdated}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        <section className="workspace-dashboard__details">
          {selectedDoc ? (
            <div className="workspace-dashboard__card">
              <h3>{getTypeIcon(selectedDoc.type)} {selectedDoc.title}</h3>
              <p className="workspace-dashboard__details-time" style={{ color: getStatusColor(selectedDoc.status) }}>
                {selectedDoc.status.replace('-', ' ').toUpperCase()} • Last updated: {selectedDoc.lastUpdated}
              </p>
              <p className="workspace-dashboard__details-summary">{selectedDoc.description}</p>

              {selectedDoc.sections && selectedDoc.sections.length > 0 && (
                <div className="workspace-dashboard__details-followups" style={{ marginTop: '1rem' }}>
                  <h4>Sections</h4>
                  <ul>
                    {selectedDoc.sections.map((section) => (
                      <li key={section}>{section}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedDoc.missingInfo && selectedDoc.missingInfo.length > 0 && (
                <div className="workspace-dashboard__details-followups">
                  <h4>Missing or Outdated Information</h4>
                  <ul style={{ color: '#f59e0b' }}>
                    {selectedDoc.missingInfo.map((info, idx) => (
                      <li key={idx}>{info}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="workspace-dashboard__empty">
              <p>Select a documentation item to view details.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
