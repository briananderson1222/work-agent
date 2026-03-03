import { useNotificationHistory, useToast } from '../contexts/ToastContext';
import './NotificationsPage.css';

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
    <div className="notifications-page">
      <div className="notifications-page__header">
        <h1 className="notifications-page__title">
          Notifications
        </h1>
        {history.length > 0 && (
          <button
            onClick={() => {
              if (confirm('Clear all notification history?')) {
                clearHistory();
              }
            }}
            className="notifications-page__clear-btn"
          >
            Clear All
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="notifications-page__empty">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="notifications-page__empty-icon"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <div>No notifications yet</div>
        </div>
      ) : (
        <div className="notifications-page__list">
          {history.map((notification) => (
            <div
              key={notification.id}
              className={`notification-card ${notification.dismissed ? 'notification-card--dismissed' : ''}`}
            >
              <div className="notification-card__header">
                <div className="notification-card__content">
                  {notification.type === 'tool-approval' && (
                    <div className="notification-card__type">
                      Tool Approval Request
                    </div>
                  )}
                  <div className="notification-card__message">
                    {notification.message}
                  </div>
                  {notification.sessionId && (
                    <div className="notification-card__detail">
                      Session: {notification.sessionId.slice(0, 8)}...
                    </div>
                  )}
                </div>
                <div className="notification-card__time">
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
