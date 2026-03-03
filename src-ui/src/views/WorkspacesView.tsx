import { WorkspaceIcon } from '../components/WorkspaceIcon';
import type { NavigationView } from '../types';
import './page-layout.css';

interface WorkspacesViewProps {
  workspaces: any[];
  onNavigate: (view: NavigationView) => void;
}

export function WorkspacesView({ workspaces, onNavigate }: WorkspacesViewProps) {
  return (
    <div className="page">
      <div className="page__header">
        <div className="page__header-text">
          <div className="page__label">manage / workspaces</div>
          <h1 className="page__title">Workspaces</h1>
          <p className="page__subtitle">Manage workspace configurations and layouts</p>
        </div>
        <div className="page__actions">
          <button className="page__btn-primary" onClick={() => onNavigate({ type: 'workspace-new' })}>+ New Workspace</button>
        </div>
      </div>
      <div className="page__card-grid">
        {workspaces.map((workspace: any) => (
          <div
            key={workspace.slug}
            className="page__card-loose"
            onClick={() => onNavigate({ type: 'workspace-edit', slug: workspace.slug })}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <WorkspaceIcon workspace={workspace} size={32} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 600 }}>{workspace.name}</span>
                  {workspace.plugin && <span className="page__card-plugin-badge">{workspace.plugin}</span>}
                </div>
              </div>
            </div>
            {workspace.description && (
              <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {workspace.description}
              </p>
            )}
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {workspace.tabCount || 0} tabs
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}