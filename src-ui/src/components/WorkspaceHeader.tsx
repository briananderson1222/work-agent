import { useState } from 'react';
import { AuthStatusBadge } from './AuthStatusBadge';
import './chat.css';

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
            <div className="workspace-header__prompts">
              {workspacePrompts.map((prompt) => (
                <button
                  key={prompt.id}
                  onClick={() => onWorkspacePromptSelect?.(prompt)}
                  type="button"
                  className="workspace-header__prompt-btn"
                >
                  {prompt.label}
                </button>
              ))}
            </div>
          )}
          <div className="workspace-header__auth-badge">
            <AuthStatusBadge />
          </div>
        </div>
      ) : null}

      {/* Tab-level header: Description, tab prompts, and controls */}
      <header className="workspace-dashboard__header workspace-header__tab-header">
        {description && (
          <p className="workspace-header__description">{description}</p>
        )}
        <div className="workspace-header__tab-actions">
          {tabActions?.map((action) => (
            <button
              key={action.id}
              onClick={() => onTabPromptSelect?.(action)}
              type="button"
              className="workspace-header__action-btn"
            >
              {action.label}
            </button>
          ))}
          {tabPrompts && tabPrompts.length > 0 && (
            <div className="workspace-header__dropdown">
              <button
                onClick={() => setShowTabPrompts(!showTabPrompts)}
                type="button"
                className="workspace-header__prompt-btn"
              >
                {title} Prompts
              </button>
              {showTabPrompts && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                    onClick={() => setShowTabPrompts(false)}
                  />
                  <div className="workspace-header__dropdown-menu">
                    {tabPrompts.map((prompt) => (
                      <button
                        key={prompt.id}
                        onClick={() => {
                          onTabPromptSelect?.(prompt);
                          setShowTabPrompts(false);
                        }}
                        className="workspace-header__dropdown-item"
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
            className="workspace-header__refresh-btn"
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
