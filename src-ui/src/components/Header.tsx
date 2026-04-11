import {
  ConnectionManagerModal,
  ConnectionStatusDot,
  useConnectionStatus,
  useConnections,
} from '@stallion-ai/connect';
import { useRuntimeConnectionsQuery } from '@stallion-ai/sdk';
import type { ConnectionConfig } from '@stallion-ai/contracts/tool';
import { useState } from 'react';
import {
  useCreateChatSession,
  useSendMessage,
} from '../hooks/useActiveChatSessions';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useShortcutDisplay } from '../hooks/useKeyboardShortcut';
import type { NavigationView } from '../types';
import { canAgentStartChat, resolveAgentExecution } from '../utils/execution';
import { getInitials } from '../utils/layout';
import { checkServerHealth } from '../lib/serverHealth';
import { NotificationHistory } from './NotificationHistory';
import './chat.css';

function getHelpPrompts(
  view?: NavigationView,
): Array<{ label: string; prompt: string }> {
  const generic = [
    {
      label: 'What can you do?',
      prompt: 'What can you help me with? List your capabilities.',
    },
    {
      label: 'System health check',
      prompt:
        'Run a system health check and tell me if anything needs attention.',
    },
  ];

  if (!view) return generic;

  const contextual: Array<{ label: string; prompt: string }> = [];

  switch (view.type) {
    case 'agents':
      contextual.push(
        {
          label: 'Create an agent for me',
          prompt: 'Help me create a new agent. Ask me what I need it to do.',
        },
        {
          label: 'What skills should I add?',
          prompt:
            'List available skills and recommend which ones to install based on common use cases.',
        },
      );
      break;
    case 'connections-tools':
      contextual.push(
        {
          label: 'Add an MCP server',
          prompt:
            'Help me add a new MCP tool server. What popular ones are available?',
        },
        {
          label: 'Browse the registry',
          prompt:
            'List available integrations from the registry and help me pick ones to install.',
        },
      );
      break;
    case 'skills':
      contextual.push({
        label: 'Install recommended skills',
        prompt:
          'What skills are available in the registry? Recommend the most useful ones and install them.',
      });
      break;
    case 'prompts':
      contextual.push({
        label: 'Create a prompt for me',
        prompt:
          'Help me create a useful prompt. Ask me what task I want to automate.',
      });
      break;
    case 'schedule':
      contextual.push({
        label: 'Schedule a recurring task',
        prompt:
          'Help me set up a scheduled job. Ask me what I want to run and when.',
      });
      break;
    case 'connections-providers':
      contextual.push({
        label: 'Configure a provider',
        prompt: 'Help me set up a new LLM provider connection.',
      });
      break;
  }

  return [...contextual, ...generic];
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
  const { setDockState, setActiveChat, navigate } = useNavigation();
  const { apiBase } = useApiBase();
  const [showHelp, setShowHelp] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const agents = useAgents();
  const createChatSession = useCreateChatSession();
  const sendMessage = useSendMessage(apiBase);
  const { data: runtimeConnections = [] } =
    useRuntimeConnectionsQuery() as {
      data?: ConnectionConfig[];
    };

  const helpPrompts = getHelpPrompts(currentView);

  function handleHelpPrompt(prompt: string) {
    setShowHelp(false);
    setDockState(true);
    const chatTarget = agents.find(
      (agent) =>
        agent.slug.startsWith('__runtime:') ||
        canAgentStartChat(agent, runtimeConnections),
    );
    if (!chatTarget) {
      navigate('/connections/runtimes');
      return;
    }
    const sessionId = createChatSession(
      chatTarget.slug,
      chatTarget.name,
      undefined,
      undefined,
      undefined,
      resolveAgentExecution(chatTarget),
    );
    setActiveChat(null); // New chat, no conversation yet
    setTimeout(() => {
      sendMessage(sessionId, chatTarget.slug, undefined, prompt);
    }, 100);
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
      {/* Mobile: hamburger + logo (opens sidebar drawer) */}
      <button
        className="app-toolbar__sidebar-toggle"
        onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
        aria-label="Toggle menu"
      >
        ☰
      </button>
      <img
        src="/favicon.png"
        alt=""
        className="app-toolbar__logo"
        onClick={() => navigate('/')}
      />
      <span className="app-toolbar__brand" onClick={() => navigate('/')}>
        Stallion
      </span>

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

        {/* Connection status chip — secondary (hidden on mobile) */}
        <button
          type="button"
          className="app-toolbar__icon-btn app-toolbar__action--secondary"
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
              navigate('/');
            } else {
              onNavigate({ type: 'profile' });
            }
          }}
          title="Profile"
          aria-label="Profile"
        >
          {userInitials}
        </button>

        <div className="app-toolbar__action--secondary">
          <button
            type="button"
            className={`app-toolbar__icon-btn app-toolbar__icon-btn--help ${showHelp ? 'is-active' : ''}`}
            onClick={() => setShowHelp(!showHelp)}
            title="Ask Stallion for help"
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
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        </div>

        {/* Help popup — rendered outside secondary div so it's visible on mobile */}
        {showHelp && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 99 }}
              onClick={() => setShowHelp(false)}
            />
            <div
              style={{
                position: 'fixed',
                top: 40,
                right: 8,
                zIndex: 100,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 8,
                width: 'min(280px, calc(100vw - 32px))',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  borderBottom: '1px solid var(--border-primary)',
                }}
              >
                Ask Stallion
              </div>
              {helpPrompts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handleHelpPrompt(p.prompt)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '10px 12px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderBottom:
                      i < helpPrompts.length - 1
                        ? '1px solid var(--border-primary)'
                        : 'none',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = 'var(--bg-tertiary)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'transparent')
                  }
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-muted)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0, marginRight: 8 }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Mobile overflow menu for secondary actions */}
        <div className="app-toolbar__overflow" style={{ position: 'relative' }}>
          <button
            type="button"
            className="app-toolbar__icon-btn app-toolbar__overflow-btn"
            onClick={() => setShowOverflow(!showOverflow)}
            aria-label="More actions"
          >
            ⋯
          </button>
          {showOverflow && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                onClick={() => setShowOverflow(false)}
              />
              <div className="app-toolbar__overflow-menu">
                <button
                  onClick={() => {
                    setShowOverflow(false);
                    setShowConnectionModal(true);
                  }}
                >
                  <ConnectionStatusDot status={connStatus} size={7} />
                  Connections
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowOverflow(false);
                    setShowHelp(true);
                  }}
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
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Help
                </button>
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
