import { useState } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import { AuthStatusBadge } from './AuthStatusBadge';
import './chat.css';

interface LayoutTab {
  id: string;
  label: string;
  icon?: string;
}

interface LayoutAction {
  type: 'prompt' | 'inline-prompt' | 'external' | 'internal';
  label: string;
  icon?: string;
  data: string;
}

interface LayoutPrompt {
  id: string;
  label: string;
  prompt: string;
  agent?: string;
}

interface LayoutHeaderProps {
  layoutName?: string;
  tabs?: LayoutTab[];
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  actions?: LayoutAction[];
  layoutPrompts?: LayoutPrompt[];  // legacy support
  onLayoutPromptSelect?: (prompt: LayoutPrompt) => void;
  onLaunchAction?: (action: LayoutAction) => void;
  title: string;
  description: string;
  tabActions?: LayoutPrompt[];
  tabPrompts?: LayoutPrompt[];
  onTabPromptSelect?: (prompt: LayoutPrompt) => void;
  onRefresh?: () => void;
  loading?: boolean;
}

function ActionButton({ action, onLaunch }: { action: LayoutAction; onLaunch: (a: LayoutAction) => void }) {
  const { navigate } = useNavigation();

  if (action.type === 'external') {
    return (
      <a
        href={action.data}
        target="_blank"
        rel="noopener noreferrer"
        className="workspace-header__prompt-btn"
        style={{ textDecoration: 'none' }}
      >
        {action.icon && <span>{action.icon} </span>}{action.label}
      </a>
    );
  }

  if (action.type === 'internal') {
    return (
      <button
        type="button"
        className="workspace-header__prompt-btn"
        onClick={() => navigate(action.data)}
      >
        {action.icon && <span>{action.icon} </span>}{action.label}
      </button>
    );
  }

  // prompt or inline-prompt
  return (
    <button
      type="button"
      className="workspace-header__prompt-btn"
      onClick={() => onLaunch(action)}
    >
      {action.icon && <span>{action.icon} </span>}{action.label}
    </button>
  );
}

export function LayoutHeader({
  layoutName: _layoutName,
  tabs,
  activeTabId,
  onTabChange,
  actions,
  layoutPrompts,
  onLayoutPromptSelect,
  onLaunchAction,
  title,
  description,
  tabActions,
  tabPrompts,
  onTabPromptSelect,
  onRefresh,
  loading,
}: LayoutHeaderProps) {
  const [showTabPrompts, setShowTabPrompts] = useState(false);

  const hasActions = (actions && actions.length > 0) || (layoutPrompts && layoutPrompts.length > 0);

  return (
    <>
      {(tabs && tabs.length > 0) || hasActions ? (
        <div className="workspace-tabs__header">
          {tabs && tabs.length > 0 && (
            <div className="workspace-tabs__container">
              {tabs.map((tab) => (
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
          <div className="workspace-header__prompts">
            {actions?.map((action) => (
              <ActionButton key={action.data} action={action} onLaunch={onLaunchAction || (() => {})} />
            ))}
            {!actions && layoutPrompts?.map((prompt) => (
              <button
                key={prompt.id}
                onClick={() => onLayoutPromptSelect?.(prompt)}
                type="button"
                className="workspace-header__prompt-btn"
              >
                {prompt.label}
              </button>
            ))}
          </div>
          <div className="workspace-header__auth-badge">
            <AuthStatusBadge />
          </div>
        </div>
      ) : null}

      <header className="workspace-dashboard__header workspace-header__tab-header">
        {description && <p className="workspace-header__description">{description}</p>}
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
                  <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setShowTabPrompts(false)} />
                  <div className="workspace-header__dropdown-menu">
                    {tabPrompts.map((prompt) => (
                      <button
                        key={prompt.id}
                        onClick={() => { onTabPromptSelect?.(prompt); setShowTabPrompts(false); }}
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
          <button onClick={onRefresh} disabled={loading} type="button" title="Refresh" className="workspace-header__refresh-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
          </button>
        </div>
      </header>
    </>
  );
}
