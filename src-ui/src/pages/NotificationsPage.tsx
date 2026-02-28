import { useNotificationHistory, useToast } from '../contexts/ToastContext';

export function NotificationsPage() {
  const history = useNotificationHistory();
  const { clearHistory } = useToast();

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
          Notifications
        </h1>
        {history.length > 0 && (
          <button
            onClick={() => {
              if (confirm('Clear all notification history?')) {
                clearHistory();
              }
            }}
            style={{
              padding: '8px 16px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'var(--text-primary)',
            }}
          >
            Clear All
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '80px 20px',
            color: 'var(--text-muted)',
            fontSize: '14px',
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginBottom: '16px', opacity: 0.5 }}
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <div>No notifications yet</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {history.map((notification) => (
            <div
              key={notification.id}
              style={{
                padding: '16px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '8px',
                opacity: notification.dismissed ? 0.6 : 1,
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
                <div style={{ flex: 1 }}>
                  {notification.type === 'tool-approval' && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        marginBottom: '6px',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                        letterSpacing: '0.5px',
                      }}
                    >
                      Tool Approval Request
                    </div>
                  )}
                  <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                    {notification.message}
                  </div>
                  {notification.sessionId && (
                    <div
                      style={{ fontSize: '12px', color: 'var(--text-muted)' }}
                    >
                      Session: {notification.sessionId.slice(0, 8)}...
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                    marginLeft: '16px',
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
  );
}
