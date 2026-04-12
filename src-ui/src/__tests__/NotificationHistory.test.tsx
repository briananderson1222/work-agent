/**
 * @vitest-environment jsdom
 */

import type { Notification } from '@stallion-ai/contracts/notification';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const dismiss = vi.fn();
const action = vi.fn();
let notifications: Notification[] = [];

vi.mock('@stallion-ai/sdk', () => ({
  useNotificationsQuery: () => ({
    data: notifications,
  }),
  useDismissNotificationMutation: () => ({
    isPending: false,
    mutate: dismiss,
  }),
  useNotificationActionMutation: () => ({
    isPending: false,
    mutate: action,
  }),
}));

import { NotificationHistory } from '../components/NotificationHistory';

describe('NotificationHistory', () => {
  beforeEach(() => {
    notifications = [];
    dismiss.mockReset();
    action.mockReset();
  });

  test('renders active notifications and routes action clicks through the server-backed mutations', () => {
    notifications = [
      {
        id: 'notif-1',
        source: 'approval-inbox',
        category: 'approval-request',
        title: 'Approval needed',
        body: 'Workspace Agent wants to use fs.read.',
        priority: 'high',
        status: 'delivered',
        actions: [{ id: 'decline', label: 'Deny', variant: 'danger' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const onClose = vi.fn();
    render(
      <NotificationHistory
        isOpen={true}
        onClose={onClose}
        onViewAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Deny'));

    expect(action).toHaveBeenCalledWith({
      actionId: 'decline',
      id: 'notif-1',
    });
    expect(onClose).toHaveBeenCalled();
  });
});
