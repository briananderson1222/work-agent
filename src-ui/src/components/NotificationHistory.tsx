import {
  useDismissNotificationMutation,
  useNotificationActionMutation,
  useNotificationsQuery,
} from '@stallion-ai/sdk';
import { useEffect, useMemo, useRef } from 'react';
import {
  formatNotificationTime,
  isApprovalNotification,
  notificationDetail,
  sortNotifications,
} from '../utils/notifications';

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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: notifications = [] } = useNotificationsQuery({
    status: ['delivered', 'pending'],
  });
  const dismissMutation = useDismissNotificationMutation();
  const actionMutation = useNotificationActionMutation();
  const recentNotifications = useMemo(
    () => sortNotifications(notifications).slice(0, 5),
    [notifications],
  );

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
            No active notifications
          </div>
        ) : (
          <div>
            {recentNotifications.map((notification) => {
              const detail = notificationDetail(notification);
              return (
                <div
                  key={notification.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-primary)',
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
                      {isApprovalNotification(notification) && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            marginBottom: '4px',
                          }}
                        >
                          Approval Request
                        </div>
                      )}
                      <div>{notification.title}</div>
                      {notification.body ? (
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            marginTop: '4px',
                            whiteSpace: 'pre-line',
                            lineHeight: 1.3,
                          }}
                        >
                          {notification.body}
                        </div>
                      ) : null}
                      {detail ? (
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            marginTop: '4px',
                            whiteSpace: 'pre-line',
                            lineHeight: 1.3,
                          }}
                        >
                          {detail}
                        </div>
                      ) : null}
                      <div
                        style={{
                          display: 'flex',
                          gap: '6px',
                          marginTop: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {notification.actions?.map((action) => (
                          <button
                            key={action.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              actionMutation.mutate({
                                actionId: action.id,
                                id: notification.id,
                              });
                              onClose();
                            }}
                            style={{
                              padding: '4px 10px',
                              background:
                                action.variant === 'primary'
                                  ? 'var(--accent-primary)'
                                  : action.variant === 'danger'
                                    ? 'var(--status-error)'
                                    : 'var(--bg-tertiary)',
                              color:
                                action.variant === 'primary' ||
                                action.variant === 'danger'
                                  ? 'white'
                                  : 'var(--text-primary)',
                              border:
                                action.variant === 'primary' ||
                                action.variant === 'danger'
                                  ? 'none'
                                  : '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 500,
                            }}
                            disabled={actionMutation.isPending}
                          >
                            {action.label}
                          </button>
                        ))}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            dismissMutation.mutate(notification.id);
                            onClose();
                          }}
                          style={{
                            padding: '4px 10px',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: 500,
                          }}
                          disabled={dismissMutation.isPending}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatNotificationTime(notification.updatedAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {notifications.length > 0 && (
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
