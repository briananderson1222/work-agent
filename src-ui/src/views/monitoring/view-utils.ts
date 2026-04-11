import { K } from '@shared/monitoring-keys';
import { parseSearchQuery } from '../../hooks/useSearchAutocomplete';
import type {
  AgentStats,
  MonitoringEvent,
  MonitoringStats,
} from '../../contexts/MonitoringContext';
import {
  getConversationColor,
  getEventType,
} from '../monitoring-utils';

export const MONITORING_QUERY_FILTER_KEYS = [
  'agent',
  'conversation',
  'tool',
  'trace',
] as const;

export interface MonitoringSelectionState {
  searchQuery: string;
  selectedAgents: string[];
  selectedConversation: string | null;
  selectedToolCallId: string | null;
  selectedTraceId: string | null;
  eventTypeFilter: string[];
}

export function parseMonitoringSearchQuery(query: string) {
  return parseSearchQuery(query, [...MONITORING_QUERY_FILTER_KEYS]);
}

export function filterMonitoringEvents(
  events: MonitoringEvent[],
  selection: MonitoringSelectionState,
) {
  const parsed = parseMonitoringSearchQuery(selection.searchQuery);

  return events
    .filter((event) => {
      const agentsToFilter = parsed.filters.agent || selection.selectedAgents;
      if (
        agentsToFilter.length > 0 &&
        !agentsToFilter.includes(event[K.AGENT_SLUG] || '')
      ) {
        return false;
      }

      const conversationToFilter =
        parsed.filters.conversation?.[0] || selection.selectedConversation;
      if (
        conversationToFilter &&
        event[K.CONVERSATION_ID] !== conversationToFilter
      ) {
        return false;
      }

      const toolCallIdToFilter =
        parsed.filters.tool?.[0] || selection.selectedToolCallId;
      if (toolCallIdToFilter && event[K.TOOL_CALL_ID] !== toolCallIdToFilter) {
        return false;
      }

      const traceIdToFilter = parsed.filters.trace?.[0] || selection.selectedTraceId;
      if (traceIdToFilter && event[K.TRACE_ID] !== traceIdToFilter) {
        return false;
      }

      if (
        selection.eventTypeFilter.length > 0 &&
        !selection.eventTypeFilter.includes(getEventType(event))
      ) {
        return false;
      }

      const isIncompleteFilter = /^(agent|conversation|tool|trace):$/.test(
        parsed.text.trim(),
      );
      if (
        parsed.text &&
        !isIncompleteFilter &&
        !JSON.stringify(event).toLowerCase().includes(parsed.text.toLowerCase())
      ) {
        return false;
      }

      return true;
    })
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
}

export function getHistoricalAgentSlugs(
  filteredEvents: MonitoringEvent[],
  activeAgents: AgentStats[],
) {
  return [...new Set(filteredEvents.map((e) => e[K.AGENT_SLUG]).filter(Boolean))].filter(
    (slug): slug is string => !activeAgents.some((agent) => agent.slug === slug),
  );
}

export function getMonitoringAgentCountLabel(
  stats: MonitoringStats | null,
  filteredEvents: MonitoringEvent[],
) {
  const activeCount = stats?.agents.length || 0;
  const historicalCount = getHistoricalAgentSlugs(filteredEvents, stats?.agents || []).length;
  return `${activeCount} Active${historicalCount > 0 ? ` • ${historicalCount} Historical` : ''}`;
}

export function getRunningConversations(
  events: MonitoringEvent[],
  agentSlug: string,
) {
  return events
    .filter(
      (event) =>
        event[K.AGENT_SLUG] === agentSlug &&
        getEventType(event) === 'agent-start' &&
        event[K.CONVERSATION_ID],
    )
    .reduce(
      (acc, event) => {
        const conversationId = event[K.CONVERSATION_ID];
        if (
          typeof conversationId === 'string' &&
          !acc.some((conversation) => conversation.id === conversationId)
        ) {
          acc.push({
            id: conversationId,
            color: getConversationColor(conversationId),
          });
        }
        return acc;
      },
      [] as Array<{ id: string; color: string }>,
    );
}
