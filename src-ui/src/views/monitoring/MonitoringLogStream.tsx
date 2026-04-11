import type { RefObject } from 'react';
import { EventEntry } from '../../components/monitoring/EventEntry';
import { getEventType } from '../monitoring-utils';

interface MonitoringLogStreamProps {
  events: any[];
  filteredEvents: any[];
  isLoading: boolean;
  newEventIds: Set<string>;
  selectedTraceId: string | null;
  selectedConversation: string | null;
  selectedToolCallId: string | null;
  showScrollButton: boolean;
  logEndRef: RefObject<HTMLDivElement>;
  logStreamRef: RefObject<HTMLDivElement>;
  onTraceClick: (traceId: string) => void;
  onConversationClick: (conversationId: string, agentSlug: string) => void;
  onToolCallClick: (toolCallId: string) => void;
  onCopyResult: (text: string) => void;
  onScrollToBottom: () => void;
}

export function MonitoringLogStream({
  events,
  filteredEvents,
  isLoading,
  newEventIds,
  selectedTraceId,
  selectedConversation,
  selectedToolCallId,
  showScrollButton,
  logEndRef,
  logStreamRef,
  onTraceClick,
  onConversationClick,
  onToolCallClick,
  onCopyResult,
  onScrollToBottom,
}: MonitoringLogStreamProps) {
  return (
    <div className="log-stream" ref={logStreamRef}>
      {isLoading && events.length === 0 ? (
        <div className="log-empty">
          <p>Loading events...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="log-empty">
          <p>No events yet. Waiting for agent activity...</p>
        </div>
      ) : (
        filteredEvents.map((event, idx) => (
          <EventEntry
            key={idx}
            event={event}
            isNew={newEventIds.has(`${event.timestamp}-${getEventType(event)}`)}
            selectedTraceId={selectedTraceId}
            selectedConversation={selectedConversation}
            selectedToolCallId={selectedToolCallId}
            onTraceClick={onTraceClick}
            onConversationClick={onConversationClick}
            onToolCallClick={onToolCallClick}
            onCopyResult={onCopyResult}
          />
        ))
      )}
      <div ref={logEndRef} />
      {showScrollButton && (
        <button
          className="scroll-to-bottom"
          onClick={onScrollToBottom}
          title="Scroll to bottom"
        >
          ↓
        </button>
      )}
    </div>
  );
}
