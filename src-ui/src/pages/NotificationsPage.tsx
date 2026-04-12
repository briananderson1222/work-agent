import {
  useClearNotificationsMutation,
  useDismissNotificationMutation,
  useNotificationActionMutation,
  useNotificationsQuery,
} from '@stallion-ai/sdk';
import {
  formatNotificationTime,
  isApprovalNotification,
  notificationDetail,
  sortNotifications,
} from '../utils/notifications';
import './NotificationsPage.css';

export function NotificationsPage() {
  const { data: notifications = [], isLoading } = useNotificationsQuery();
  const clearAllMutation = useClearNotificationsMutation();
  const dismissMutation = useDismissNotificationMutation();
  const actionMutation = useNotificationActionMutation();

  const orderedNotifications = sortNotifications(notifications);

  if (isLoading) {
    return (
      <div className="notifications-page__empty">Loading notifications…</div>
    );
  }

  return (
    <div className="notifications-page">
      <div className="notifications-page__header">
        <h1 className="notifications-page__title">Notifications</h1>
        {orderedNotifications.length > 0 && (
          <button
            onClick={() => {
              if (confirm('Clear all notifications?')) {
                clearAllMutation.mutate();
              }
            }}
            className="notifications-page__clear-btn"
          >
            Clear All
          </button>
        )}
      </div>

      {orderedNotifications.length === 0 ? (
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
          {orderedNotifications.map((notification) => {
            const detail = notificationDetail(notification);
            return (
              <div
                key={notification.id}
                className={`notification-card notification-card--${notification.status}`}
              >
                <div className="notification-card__header">
                  <div className="notification-card__content">
                    {isApprovalNotification(notification) && (
                      <div className="notification-card__type">
                        Approval Request
                      </div>
                    )}
                    <div className="notification-card__message">
                      {notification.title}
                    </div>
                    {notification.body ? (
                      <div className="notification-card__detail">
                        {notification.body}
                      </div>
                    ) : null}
                    {detail ? (
                      <div className="notification-card__detail">{detail}</div>
                    ) : null}
                  </div>
                  <div className="notification-card__time">
                    {formatNotificationTime(notification.updatedAt)}
                  </div>
                </div>

                {(notification.actions?.length || notification.status) && (
                  <div className="notification-card__footer">
                    <div className="notification-card__status">
                      {notification.status.replace('-', ' ')}
                    </div>
                    <div className="notification-card__actions">
                      {notification.actions?.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          className={`notification-card__action notification-card__action--${action.variant ?? 'secondary'}`}
                          onClick={() =>
                            actionMutation.mutate({
                              actionId: action.id,
                              id: notification.id,
                            })
                          }
                          disabled={
                            actionMutation.isPending ||
                            notification.status !== 'delivered'
                          }
                        >
                          {action.label}
                        </button>
                      ))}
                      {notification.status === 'delivered' && (
                        <button
                          type="button"
                          className="notification-card__action notification-card__action--ghost"
                          onClick={() =>
                            dismissMutation.mutate(notification.id)
                          }
                          disabled={dismissMutation.isPending}
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
