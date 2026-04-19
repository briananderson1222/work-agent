/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../views/monitoring-utils', () => ({
  getAgentColor: () => '#00aa88',
}));

vi.mock('../views/monitoring/view-utils', () => ({
  getHistoricalAgentSlugs: () => ['historical-agent'],
  getMonitoringAgentCountLabel: () => '2 agents',
  getRunningConversations: () => [{ id: 'conv:abc12345', color: '#00aa88' }],
}));

import { MonitoringSidebar } from '../views/monitoring/MonitoringSidebar';

describe('MonitoringSidebar', () => {
  test('uses title case labels for headings and statuses', () => {
    const onAgentClick = vi.fn();
    const onConversationClick = vi.fn();

    render(
      <MonitoringSidebar
        stats={
          {
            summary: {
              activeAgents: 1,
              runningAgents: 1,
              totalEvents: 0,
            },
            agents: [
              {
                slug: 'runtime-agent',
                name: 'Runtime Agent',
                status: 'running',
                healthy: true,
                model: 'codex',
                messageCount: 4,
              },
            ],
          } as any
        }
        events={[]}
        filteredEvents={[]}
        selectedAgents={[]}
        onAgentClick={onAgentClick}
        onConversationClick={onConversationClick}
        resolveModelName={(modelId) => modelId}
      />,
    );

    expect(screen.getByText('Agents')).toBeTruthy();
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getAllByText('Historical')).toHaveLength(2);

    fireEvent.click(screen.getByText('Runtime Agent'));
    expect(onAgentClick).toHaveBeenCalled();

    fireEvent.click(screen.getByText('abc12345...'));
    expect(onConversationClick).toHaveBeenCalledWith(
      'conv:abc12345',
      'runtime-agent',
    );
  });
});
