/**
 * @vitest-environment jsdom
 */

import type { Notification } from '@stallion-ai/contracts/notification';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const clearAll = vi.fn();
const dismiss = vi.fn();
const action = vi.fn();
let notifications: Notification[] = [];

vi.mock('@stallion-ai/sdk', () => ({
  useNotificationsQuery: () => ({
    data: notifications,
    isLoading: false,
  }),
  useClearNotificationsMutation: () => ({
    mutate: clearAll,
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

import { NotificationsPage } from '../pages/NotificationsPage';

describe('NotificationsPage', () => {
  beforeEach(() => {
    notifications = [];
    clearAll.mockReset();
    dismiss.mockReset();
    action.mockReset();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  test('renders approval notifications with actions', () => {
    notifications = [
      {
        id: 'notif-1',
        source: 'approval-inbox',
        category: 'approval-request',
        title: 'Approval needed',
        body: 'Workspace Agent wants to use fs.read.',
        priority: 'high',
        status: 'delivered',
        actions: [{ id: 'accept', label: 'Allow Once', variant: 'primary' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    render(<NotificationsPage />);

    expect(screen.getByText('Approval Request')).toBeTruthy();
    fireEvent.click(screen.getByText('Allow Once'));
    expect(action).toHaveBeenCalledWith({
      actionId: 'accept',
      id: 'notif-1',
    });
  });

  test('renders structured empty-state copy when there are no notifications', () => {
    render(<NotificationsPage />);

    expect(
      screen.getByText('Approvals, alerts, and system updates in one place.'),
    ).toBeTruthy();
    expect(screen.getByText('No notifications yet')).toBeTruthy();
    expect(
      screen.getByText(
        'New approvals, job updates, and system alerts will appear here.',
      ),
    ).toBeTruthy();
  });

  test('clears notifications from the page header action', () => {
    notifications = [
      {
        id: 'notif-2',
        source: 'scheduler',
        category: 'job',
        title: 'Job failed',
        priority: 'normal',
        status: 'delivered',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    render(<NotificationsPage />);

    fireEvent.click(screen.getByText('Clear All'));
    expect(clearAll).toHaveBeenCalled();
  });
});
