import { useAllActiveChats } from '../contexts/ActiveChatsContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useNotificationHistory, useToast } from '../contexts/ToastContext';

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;

  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function NotificationContainer() {
  const history = useNotificationHistory();
  const { dismissToast } = useToast();
  const activeChats = useAllActiveChats();
  const { setProject, setLayout } = useNavigation();

  // Only show notifications that haven't been dismissed
  const activeNotifications = history.filter((n) => !n.dismissed);

  const handleNavigateTo = (
    metadata: Record<string, unknown>,
    toastId: string,
  ) => {
    const nav = metadata.navigateTo as
      | { project?: string; layout?: string }
      | undefined;
    if (!nav) return;
    if (nav.project) {
      setProject(nav.project);
      if (nav.layout) setLayout(nav.project, nav.layout);
    }
    dismissToast(toastId);
  };

  // Get keyboard shortcut for a session
  const getSessionShortcut = (sessionId: string | undefined): string | null => {
    if (!sessionId) return null;
    const sessionIndex = Object.keys(activeChats).indexOf(sessionId);
    if (sessionIndex >= 0 && sessionIndex < 9) {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      return `${isMac ? '⌘' : 'Ctrl+'}${sessionIndex + 1}`;
    }
    return null;
  };

  if (activeNotifications.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(var(--app-toolbar-height, 46px) + var(--safe-top, 0px) + 8px)',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: 'calc(100vw - 40px)',
        pointerEvents: 'none',
      }}
    >
      {activeNotifications.map((notification) => (
        <div
          key={notification.id}
          style={{
            padding: '16px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            color: 'var(--text-primary)',
            pointerEvents: 'auto',
            minWidth: '320px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'start',
              marginBottom: '8px',
            }}
          >
            <div style={{ flex: 1, paddingRight: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '6px',
                }}
              >
                {notification.type === 'tool-approval' && (
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      letterSpacing: '0.5px',
                    }}
                  >
                    Tool Approval Request
                  </div>
                )}
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-tertiary)',
                    marginLeft:
                      notification.type === 'tool-approval' ? '0' : 'auto',
                  }}
                >
                  {formatTimestamp(notification.timestamp)}
                </div>
              </div>
              <div style={{ fontSize: '14px' }}>{notification.message}</div>
              {notification.metadata?.detail ? (
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    marginTop: '6px',
                    whiteSpace: 'pre-line',
                    lineHeight: 1.4,
                  }}
                >
                  {notification.metadata.detail as string}
                </div>
              ) : null}
              {notification.conversationTitle && notification.onNavigate && (
                <div
                  style={{
                    marginTop: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span
                    style={{ fontSize: '13px', color: 'var(--text-secondary)' }}
                  >
                    in{' '}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      notification.onNavigate?.();
                      dismissToast(notification.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-primary)',
                      fontSize: '13px',
                      cursor: 'pointer',
                      padding: '0',
                      textDecoration: 'underline',
                      fontWeight: 500,
                    }}
                  >
                    "{notification.conversationTitle}"
                  </button>
                  {getSessionShortcut(notification.sessionId) && (
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        background: 'var(--bg-tertiary)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                      }}
                    >
                      {getSessionShortcut(notification.sessionId)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => dismissToast(notification.id)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '0',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>

          {notification.actions && notification.actions.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              {notification.actions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    action.onClick();
                    dismissToast(notification.id);
                  }}
                  style={{
                    padding: '8px 16px',
                    background:
                      action.variant === 'danger'
                        ? '#ef4444'
                        : action.variant === 'primary'
                          ? 'var(--accent-primary)'
                          : 'var(--bg-tertiary)',
                    color:
                      action.variant === 'danger' ||
                      action.variant === 'primary'
                        ? 'white'
                        : 'var(--text-primary)',
                    border:
                      action.variant === 'secondary'
                        ? '1px solid var(--border-primary)'
                        : 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {notification.metadata?.navigateTo != null && (
            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginTop: notification.actions?.length ? '8px' : '12px',
              }}
            >
              <button
                onClick={() =>
                  handleNavigateTo(notification.metadata!, notification.id)
                }
                style={{
                  padding: '8px 16px',
                  background: 'var(--accent-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                View
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
