import { useState } from 'react';
import { AuthStatusBadge } from './AuthStatusBadge';

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
  tabActions?: WorkspacePrompt[];
  tabPrompts?: WorkspacePrompt[];
  onTabPromptSelect?: (prompt: WorkspacePrompt) => void;
  onRefresh?: () => void;
  loading?: boolean;
}

export function WorkspaceHeader({
  workspaceName: _workspaceName,
  tabs,
  activeTabId,
  onTabChange,
  workspacePrompts,
  onWorkspacePromptSelect,
  title,
  description,
  tabActions,
  tabPrompts,
  onTabPromptSelect,
  onRefresh,
  loading,
}: WorkspaceHeaderProps) {
  const [_showWorkspacePrompts, _setShowWorkspacePrompts] = useState(false);
  const [showTabPrompts, setShowTabPrompts] = useState(false);

  return (
    <>
      {/* Workspace-level header: Tabs and workspace prompts */}
      {(tabs && tabs.length > 0) ||
      (workspacePrompts && workspacePrompts.length > 0) ? (
        <div className="workspace-tabs__header">
          {tabs && tabs.length > 0 && (
            <div className="workspace-tabs__container">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange?.(tab.id)}
                  className={`workspace-tabs__tab ${activeTabId === tab.id ? 'workspace-tabs__tab--active' : ''}`}
                >
                  {tab.icon && (
                    <span className="workspace-tabs__icon">{tab.icon}</span>
                  )}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          )}
          {workspacePrompts && workspacePrompts.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
              {workspacePrompts.map((prompt) => (
                <button
                  key={prompt.id}
                  onClick={() => onWorkspacePromptSelect?.(prompt)}
                  type="button"
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'transparent',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = 'var(--color-bg-hover)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'transparent')
                  }
                >
                  {prompt.label}
                </button>
              ))}
            </div>
          )}
          <div style={{ marginLeft: workspacePrompts?.length ? '0' : 'auto' }}>
            <AuthStatusBadge />
          </div>
        </div>
      ) : null}

      {/* Tab-level header: Description, tab prompts, and controls */}
      <header
        className="workspace-dashboard__header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '0.5rem 1rem',
          minHeight: 0,
        }}
      >
        {description && (
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.8125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {description}
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto', flexShrink: 0 }}>
          {tabActions?.map((action) => (
            <button
              key={action.id}
              onClick={() => onTabPromptSelect?.(action)}
              type="button"
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--accent-primary)',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              {action.label}
            </button>
          ))}
          {tabPrompts && tabPrompts.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowTabPrompts(!showTabPrompts)}
                type="button"
                style={{
                  padding: '0.5rem 1rem',
                  background: 'transparent',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'var(--color-bg-hover)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                {title} Prompts
              </button>
              {showTabPrompts && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                    onClick={() => setShowTabPrompts(false)}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 0.5rem)',
                      right: 0,
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '0.5rem',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      minWidth: '200px',
                      zIndex: 1000,
                    }}
                  >
                    {tabPrompts.map((prompt) => (
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
                          borderBottom: '1px solid var(--color-border)',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            'var(--color-bg-hover)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = 'none')
                        }
                      >
                        {prompt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            type="button"
            title="Refresh"
            style={{
              padding: '0.5rem',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: '0.375rem',
              fontSize: '1.25rem',
              cursor: loading ? 'wait' : 'pointer',
              transition: 'background-color 0.2s, color 0.2s',
              opacity: loading ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.background = 'var(--color-bg-hover)';
                e.currentTarget.style.color = 'var(--color-text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-secondary)';
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                animation: loading ? 'spin 1s linear infinite' : 'none',
              }}
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
          </button>
        </div>
      </header>
    </>
  );
}
