import { useEffect, useRef } from 'react';
import { useNotificationHistory } from '../contexts/ToastContext';

interface NotificationHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onViewAll: () => void;
}

export function NotificationHistory({
  isOpen,
  onClose,
  onViewAll,
}: NotificationHistoryProps) {
  const history = useNotificationHistory();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const recentNotifications = history.slice(0, 5); // Show only 5 most recent

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: 40,
        right: 8,
        marginTop: '8px',
        width: 'min(360px, calc(100vw - 16px))',
        maxHeight: '400px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-primary)',
          fontWeight: 600,
          fontSize: '14px',
        }}
      >
        Notifications
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {recentNotifications.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: 'var(--text-muted)',
              fontSize: '13px',
            }}
          >
            No notifications yet
          </div>
        ) : (
          <div>
            {recentNotifications.map((notification) => (
              <div
                key={notification.id}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-primary)',
                  opacity: notification.dismissed ? 0.6 : 1,
                  fontSize: '13px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                    marginBottom: '4px',
                  }}
                >
                  <div style={{ flex: 1, paddingRight: '8px' }}>
                    {notification.type === 'tool-approval' && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          marginBottom: '4px',
                        }}
                      >
                        Tool Approval Request
                      </div>
                    )}
                    <div>{notification.message}</div>
                    {notification.metadata?.detail ? (
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          marginTop: '4px',
                          whiteSpace: 'pre-line',
                          lineHeight: 1.3,
                        }}
                      >
                        {notification.metadata.detail as string}
                      </div>
                    ) : null}
                    {notification.actions &&
                      notification.actions.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            gap: '6px',
                            marginTop: '8px',
                          }}
                        >
                          {notification.actions.map((action, idx) => (
                            <button
                              key={idx}
                              onClick={(e) => {
                                e.stopPropagation();
                                action.onClick();
                                onClose();
                              }}
                              style={{
                                padding: '4px 10px',
                                background:
                                  action.variant === 'primary'
                                    ? 'var(--accent-primary)'
                                    : 'var(--bg-tertiary)',
                                color:
                                  action.variant === 'primary'
                                    ? 'white'
                                    : 'var(--text-primary)',
                                border:
                                  action.variant === 'primary'
                                    ? 'none'
                                    : '1px solid var(--border-primary)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 500,
                              }}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatTime(notification.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border-primary)',
          }}
        >
          <button
            onClick={() => {
              onViewAll();
              onClose();
            }}
            style={{
              width: '100%',
              padding: '8px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'var(--text-primary)',
              fontWeight: 500,
            }}
          >
            View All Notifications
          </button>
        </div>
      )}
    </div>
  );
}
