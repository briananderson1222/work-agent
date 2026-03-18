import {
  ConnectionManagerModal,
  ConnectionStatusDot,
  useConnectionStatus,
  useConnections,
} from '@stallion-ai/connect';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useSendMessage, useActiveChatActions, useCreateChatSession } from '../contexts/ActiveChatsContext';
import { useShortcutDisplay } from '../hooks/useKeyboardShortcut';
import type { NavigationView } from '../types';
import { getInitials } from '../utils/layout';
import { NotificationHistory } from './NotificationHistory';
import './chat.css';

function checkServerHealth(url: string): Promise<boolean> {
  return fetch(`${url}/api/system/status`)
    .then((r) => r.ok)
    .catch(() => false);
}

interface HeaderProps {
  currentView?: NavigationView;
  onToggleSettings: () => void;
  onNavigate: (view: NavigationView) => void;
}

export function Header({
  currentView,
  onToggleSettings,
  onNavigate,
}: HeaderProps) {
  const settingsShortcut = useShortcutDisplay('app.settings');
  const { setDockState } = useNavigation();
  const { apiBase } = useApiBase();
  const [showHelp, setShowHelp] = useState(false);

  const helpPrompts = getHelpPrompts(currentView);

  function handleHelpPrompt(prompt: string) {
    setShowHelp(false);
    setDockState(true);
    // Small delay to let dock open, then the user sees the prompt ready
    // The prompt is copied to clipboard-style — user can paste or we auto-send
    // For now, just open dock. The prompt is shown as a suggestion.
    navigator.clipboard?.writeText(prompt).catch(() => {});
  }
  const { user: authUser } = useAuth();
  const userName = authUser?.name || authUser?.alias || 'User';
  const userInitials = getInitials(userName);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const { activeConnection } = useConnections();
  const { status: connStatus } = useConnectionStatus({
    checkHealth: checkServerHealth,
    pollInterval: 15_000,
  });

  return (
    <header className="app-toolbar">
      {/* Breadcrumb — show current project/layout context */}
      {currentView &&
        'projectSlug' in currentView &&
        (currentView as any).projectSlug && (
          <div className="app-toolbar__breadcrumb">
            <span
              className="app-toolbar__breadcrumb-link"
              onClick={() =>
                onNavigate({
                  type: 'project',
                  slug: (currentView as any).projectSlug,
                })
              }
            >
              {(currentView as any).projectSlug}
            </span>
            {'layoutSlug' in currentView && (currentView as any).layoutSlug && (
              <>
                <span className="app-toolbar__breadcrumb-sep">/</span>
                <span className="app-toolbar__breadcrumb-current">
                  {(currentView as any).layoutSlug}
                </span>
              </>
            )}
          </div>
        )}

      <div className="app-toolbar__spacer" />

      <div className="app-toolbar__actions">
        <div className="header-divider" />

        {/* Connection status chip */}
        <button
          type="button"
          className="app-toolbar__icon-btn"
          onClick={() => setShowConnectionModal(true)}
          title="Manage connections"
        >
          <ConnectionStatusDot status={connStatus} size={7} />
          {activeConnection?.name && activeConnection.name !== 'Default' && (
            <span className="app-toolbar__conn-name">
              {activeConnection.name}
            </span>
          )}
        </button>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="app-toolbar__icon-btn"
            onClick={() => setShowNotifications(!showNotifications)}
            title="Notifications"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
          </button>
          <NotificationHistory
            isOpen={showNotifications}
            onClose={() => setShowNotifications(false)}
            onViewAll={() => onNavigate({ type: 'notifications' })}
          />
        </div>

        <button
          type="button"
          className={`app-toolbar__icon-btn ${currentView?.type === 'profile' ? 'is-active' : ''}`}
          onClick={() => {
            if (currentView?.type === 'profile') {
              onNavigate({ type: 'standalone-layout' });
            } else {
              onNavigate({ type: 'profile' });
            }
          }}
          title="Profile"
        >
          {userInitials}
        </button>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className={`app-toolbar__icon-btn ${showHelp ? 'is-active' : ''}`}
            onClick={() => setShowHelp(!showHelp)}
            title="Ask Stallion for help"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
          {showHelp && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowHelp(false)} />
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 100,
                background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
                borderRadius: 8, width: 280, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                overflow: 'hidden',
              }}>
                <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border-primary)' }}>
                  Ask Stallion
                </div>
                {helpPrompts.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => handleHelpPrompt(p.prompt)}
                    style={{
                      display: 'block', width: '100%', padding: '10px 12px', border: 'none',
                      background: 'transparent', color: 'var(--text-primary)', fontSize: 13,
                      textAlign: 'left', cursor: 'pointer', borderBottom: i < helpPrompts.length - 1 ? '1px solid var(--border-primary)' : 'none',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ marginRight: 8 }}>{p.icon}</span>
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          className={`app-toolbar__icon-btn ${currentView?.type === 'settings' ? 'is-active' : ''}`}
          onClick={onToggleSettings}
          title={`Settings (${settingsShortcut})`}
        >
          ⚙
        </button>
      </div>

      {/* Connection manager modal */}
      <ConnectionManagerModal
        isOpen={showConnectionModal}
        onClose={() => setShowConnectionModal(false)}
        checkHealth={checkServerHealth}
      />
    </header>
  );
}
