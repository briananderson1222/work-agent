import { describe, expect, it, vi } from 'vitest';
import { K } from '../../../src-shared/monitoring-keys';
import type {
  AgentStats,
  MonitoringEvent,
} from '../contexts/MonitoringContext';

vi.mock('@shared/monitoring-keys', async () =>
  import('../../../src-shared/monitoring-keys'),
);

const {
  filterMonitoringEvents,
  getHistoricalAgentSlugs,
  getMonitoringAgentCountLabel,
  getRunningConversations,
} = await import('../views/monitoring/view-utils');

function createEvent(overrides: Partial<MonitoringEvent>): MonitoringEvent {
  return {
    timestamp: '2026-01-01T00:00:00.000Z',
    'timestamp.ms': 1,
    'trace.id': 'trace-1',
    'gen_ai.operation.name': 'invoke_agent',
    'span.kind': 'start',
    ...overrides,
  };
}

describe('monitoring view utils', () => {
  it('filters events with selected sidebar filters and sorts oldest first', () => {
    const events = [
      createEvent({
        timestamp: '2026-01-01T00:00:02.000Z',
        [K.AGENT_SLUG]: 'beta',
        [K.CONVERSATION_ID]: 'conversation-2',
      }),
      createEvent({
        timestamp: '2026-01-01T00:00:01.000Z',
        [K.AGENT_SLUG]: 'alpha',
        [K.CONVERSATION_ID]: 'conversation-1',
      }),
    ];

    const filtered = filterMonitoringEvents(events, {
      searchQuery: '',
      selectedAgents: ['alpha'],
      selectedConversation: null,
      selectedToolCallId: null,
      selectedTraceId: null,
      eventTypeFilter: ['agent-start'],
    });

    expect(filtered).toEqual([
      expect.objectContaining({
        [K.AGENT_SLUG]: 'alpha',
        [K.CONVERSATION_ID]: 'conversation-1',
      }),
    ]);
  });

  it('derives historical agents and running conversations from events', () => {
    const activeAgents: AgentStats[] = [
      {
        slug: 'alpha',
        name: 'Alpha',
        status: 'running',
        model: 'model-a',
        conversationCount: 1,
        messageCount: 2,
        cost: 0,
      },
    ];
    const filteredEvents = [
      createEvent({
        [K.AGENT_SLUG]: 'alpha',
        [K.CONVERSATION_ID]: 'conversation:1',
      }),
      createEvent({
        [K.AGENT_SLUG]: 'legacy',
        [K.CONVERSATION_ID]: 'conversation:2',
      }),
    ];

    expect(getHistoricalAgentSlugs(filteredEvents, activeAgents)).toEqual([
      'legacy',
    ]);
    expect(
      getMonitoringAgentCountLabel(
        {
          agents: activeAgents,
          summary: {
            totalAgents: 1,
            activeAgents: 1,
            runningAgents: 1,
            totalMessages: 2,
            totalCost: 0,
          },
        },
        filteredEvents,
      ),
    ).toBe('1 Active • 1 Historical');
    expect(getRunningConversations(filteredEvents, 'alpha')).toEqual([
      {
        id: 'conversation:1',
        color: expect.any(String),
      },
    ]);
  });
});
