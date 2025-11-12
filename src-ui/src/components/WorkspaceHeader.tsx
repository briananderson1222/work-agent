import { useState } from 'react';

interface WorkspaceTab {
  id: string;
  label: string;
  icon?: string;
}

interface WorkspacePrompt {
  id: string;
  label: string;
  prompt: string;
  agent?: string;
}

interface WorkspaceHeaderProps {
  // Workspace-level (top header)
  workspaceName?: string;
  tabs?: WorkspaceTab[];
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  workspacePrompts?: WorkspacePrompt[];
  onWorkspacePromptSelect?: (prompt: WorkspacePrompt) => void;
  
  // Tab-level (second header)
  title: string;
  description: string;
  tabPrompts?: WorkspacePrompt[];
  onTabPromptSelect?: (prompt: WorkspacePrompt) => void;
  onRefresh?: () => void;
  loading?: boolean;
}

export function WorkspaceHeader({ 
  workspaceName,
  tabs,
  activeTabId,
  onTabChange,
  workspacePrompts,
  onWorkspacePromptSelect,
  title, 
  description, 
  tabPrompts,
  onTabPromptSelect,
  onRefresh, 
  loading 
}: WorkspaceHeaderProps) {
  const [showWorkspacePrompts, setShowWorkspacePrompts] = useState(false);
  const [showTabPrompts, setShowTabPrompts] = useState(false);

  return (
    <>
      {/* Workspace-level header: Tabs and workspace prompts */}
      {(tabs && tabs.length > 0) || (workspacePrompts && workspacePrompts.length > 0) ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.5rem',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg)',
          minHeight: '3rem'
        }}>
          {tabs && tabs.length > 0 && (
            <div className="workspace-tabs__container">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange?.(tab.id)}
                  className={`workspace-tabs__tab ${activeTabId === tab.id ? 'workspace-tabs__tab--active' : ''}`}
                >
                  {tab.icon && <span className="workspace-tabs__icon">{tab.icon}</span>}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          )}
          {workspacePrompts && workspacePrompts.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                className="workspace-dashboard__action"
                onClick={() => setShowWorkspacePrompts(!showWorkspacePrompts)}
                type="button"
                style={{
                  background: 'var(--color-primary)',
                  color: 'var(--color-bg)',
                  border: 'none'
                }}
              >
                {workspaceName} Prompts
              </button>
              {showWorkspacePrompts && (
                <>
                  <div 
                    style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                    onClick={() => setShowWorkspacePrompts(false)}
                  />
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 0.5rem)',
                    right: 0,
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    minWidth: '200px',
                    zIndex: 1000
                  }}>
                    {workspacePrompts.map(prompt => (
                      <button
                        key={prompt.id}
                        onClick={() => {
                          onWorkspacePromptSelect?.(prompt);
                          setShowWorkspacePrompts(false);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-text-primary)',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          borderBottom: '1px solid var(--color-border)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                      >
                        {prompt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Tab-level header: Title, description, tab prompts, and controls */}
      <header className="workspace-dashboard__header" style={{ 
        display: 'flex', 
        alignItems: 'flex-start', 
        justifyContent: 'space-between',
        gap: '1rem'
      }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: '0 0 0.25rem 0' }}>{title}</h2>
          <p style={{ margin: '0', color: 'var(--color-text-secondary)' }}>{description}</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {tabPrompts && tabPrompts.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                className="workspace-dashboard__action"
                onClick={() => setShowTabPrompts(!showTabPrompts)}
                type="button"
                style={{
                  background: 'var(--color-primary)',
                  color: 'var(--color-bg)',
                  border: 'none'
                }}
              >
                {title} Prompts
              </button>
              {showTabPrompts && (
                <>
                  <div 
                    style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                    onClick={() => setShowTabPrompts(false)}
                  />
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 0.5rem)',
                    right: 0,
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    minWidth: '200px',
                    zIndex: 1000
                  }}>
                    {tabPrompts.map(prompt => (
                      <button
                        key={prompt.id}
                        onClick={() => {
                          onTabPromptSelect?.(prompt);
                          setShowTabPrompts(false);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-text-primary)',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          borderBottom: '1px solid var(--color-border)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                      >
                        {prompt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {onRefresh && (
            <div className="workspace-dashboard__actions">
              <button 
                className="workspace-dashboard__action" 
                onClick={onRefresh}
                disabled={loading}
                type="button"
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          )}
        </div>
      </header>
    </>
  );
}
