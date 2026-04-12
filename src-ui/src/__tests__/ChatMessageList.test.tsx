/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../contexts/AgentsContext', () => ({
  useAgents: () => [],
}));

vi.mock('../contexts/ApiBaseContext', () => ({
  useApiBase: () => ({
    apiBase: 'http://localhost:3242',
  }),
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('../hooks/useToolApproval', () => ({
  useToolApproval: () => vi.fn(),
}));

vi.mock('../components/chat/StreamingMessage', () => ({
  StreamingMessage: () => <div data-testid="streaming-message">Streaming</div>,
}));

import { ChatMessageList } from '../components/chat/ChatMessageList';

describe('ChatMessageList', () => {
  test('renders the streaming message when a session is active with no persisted messages', () => {
    render(
      <ChatMessageList
        activeSession={{
          id: 'session-1',
          agentSlug: 'dev-agent',
          agentName: 'Dev Agent',
          title: 'Dev Agent Chat',
          messages: [],
          input: '',
          attachments: [],
          queuedMessages: [],
          inputHistory: [],
          hasUnread: false,
          status: 'sending',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          source: 'manual',
        }}
        fontSize={14}
        showReasoning
        showToolDetails
      />,
    );

    expect(screen.getByTestId('streaming-message')).toBeTruthy();
    expect(screen.queryByText('Start a conversation')).toBeNull();
  });
});
