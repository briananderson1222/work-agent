/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const useStreamingContent = vi.fn();

vi.mock('../hooks/useStreamingContent', () => ({
  useStreamingContent: (sessionId: string) => useStreamingContent(sessionId),
}));

import { StreamingMessage } from '../components/chat/StreamingMessage';

describe('StreamingMessage', () => {
  beforeEach(() => {
    useStreamingContent.mockReset();
  });

  test('renders tool progress status for a running tool with progress text', () => {
    useStreamingContent.mockReturnValue({
      streamingText: '',
      hasContent: true,
      contentParts: [
        {
          type: 'tool',
          tool: {
            id: 'tool-1',
            name: 'search_files',
            state: 'running',
            progressMessage: 'Scanning project files',
          },
        },
      ],
    });

    render(
      <StreamingMessage
        sessionId="session-1"
        agentIcon={<div>AI</div>}
        agentIconStyle={{}}
        fontSize={14}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain(
      'Scanning project files',
    );
    expect(screen.getByText('search files')).toBeTruthy();
  });

  test('renders fallback progress text for a running tool without progress text', () => {
    useStreamingContent.mockReturnValue({
      streamingText: '',
      hasContent: true,
      contentParts: [
        {
          type: 'tool',
          tool: {
            id: 'tool-2',
            name: 'run_tests',
            state: 'running',
          },
        },
      ],
    });

    render(
      <StreamingMessage
        sessionId="session-2"
        agentIcon={<div>AI</div>}
        agentIconStyle={{}}
        fontSize={14}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain(
      'Running run tests',
    );
  });

  test('renders ui blocks emitted from tool output parts', () => {
    useStreamingContent.mockReturnValue({
      streamingText: '',
      hasContent: true,
      contentParts: [
        {
          type: 'ui-block',
          uiBlock: {
            type: 'card',
            title: 'Build Summary',
            body: 'All checks passed',
            fields: [{ label: 'Coverage', value: '98%' }],
          },
        },
      ],
    });

    render(
      <StreamingMessage
        sessionId="session-3"
        agentIcon={<div>AI</div>}
        agentIconStyle={{}}
        fontSize={14}
      />,
    );

    expect(screen.getByText('Build Summary')).toBeTruthy();
    expect(screen.getByText('All checks passed')).toBeTruthy();
    expect(screen.getByText('98%')).toBeTruthy();
  });
});
