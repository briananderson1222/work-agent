/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

const dismissToast = vi.fn();
const setProject = vi.fn();
const setLayout = vi.fn();

vi.mock('../contexts/ToastContext', () => ({
  useNotificationHistory: () => [
    {
      id: 'tool-1',
      message: 'Dev Agent failed shell exec',
      type: 'tool-activity',
      timestamp: Date.now(),
      dismissed: false,
      conversationTitle: 'Repo Chat',
      sessionId: 'session-1',
      metadata: { detail: 'Permission denied' },
    },
  ],
  useToast: () => ({
    dismissToast,
  }),
}));

vi.mock('../contexts/ActiveChatsContext', () => ({
  useAllActiveChats: () => ({
    'session-1': {},
  }),
}));

vi.mock('../contexts/NavigationContext', () => ({
  useNavigation: () => ({
    setProject,
    setLayout,
  }),
}));

import { NotificationContainer } from '../components/NotificationContainer';

describe('NotificationContainer', () => {
  test('renders tool activity toasts with their label and detail', () => {
    render(<NotificationContainer />);

    expect(screen.getByText('Tool Activity')).toBeTruthy();
    expect(screen.getByText('Dev Agent failed shell exec')).toBeTruthy();
    expect(screen.getByText('Permission denied')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(dismissToast).toHaveBeenCalledWith('tool-1');
  });
});
