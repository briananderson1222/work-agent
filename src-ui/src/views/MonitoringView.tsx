import { K } from '@shared/monitoring-keys';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EventEntry } from '../components/monitoring/EventEntry';
import { MetricsPanel } from '../components/monitoring/MetricsPanel';
import { useModels } from '../contexts/ModelsContext';
import { useMonitoring } from '../contexts/MonitoringContext';
import { useToast } from '../contexts/ToastContext';
import {
  useSearchAutocomplete,
} from '../hooks/useSearchAutocomplete';
import {
  EVENT_TYPE_GROUPS,
  getEventType,
} from './monitoring-utils';
import { MonitoringViewBoundary } from './MonitoringErrorBoundary';
import { MonitoringLogControls } from './MonitoringLogControls';
import { MonitoringTimeControls } from './MonitoringTimeControls';
import { MonitoringActiveFilters } from './monitoring/MonitoringActiveFilters';
import { MonitoringHeader } from './monitoring/MonitoringHeader';
import { MonitoringSidebar } from './monitoring/MonitoringSidebar';
import {
  filterMonitoringEvents,
  parseMonitoringSearchQuery,
} from './monitoring/view-utils';
import { useMonitoringTimeRange } from './monitoring-time-range';
import './MonitoringView.css';

export function MonitoringView() {
  const {
    stats,
    events,
    clearEvents,
    setTimeRange,
    connectionStatus,
    isLoading,
  } = useMonitoring();
  const { showToast } = useToast();
  const models = useModels();
  const [autoFollow, setAutoFollow] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const searchFilters = useMemo(
    () => [
      {
        key: 'agent',
        type: 'agent' as const,
        getOptions: () => (stats?.agents || []).map((a) => a.slug),
      },
      {
        key: 'conversation',
        type: 'conversation' as const,
        getOptions: () =>
          [
            ...new Set(events.map((e) => e[K.CONVERSATION_ID]).filter(Boolean)),
          ] as string[],
      },
      {
        key: 'tool',
        type: 'tool' as const,
        getOptions: () =>
          [
            ...new Set(events.map((e) => e[K.TOOL_CALL_ID]).filter(Boolean)),
          ] as string[],
      },
      {
        key: 'trace',
        type: 'trace' as const,
        getOptions: () =>
          [
            ...new Set(events.map((e) => e[K.TRACE_ID]).filter(Boolean)),
          ] as string[],
      },
    ],
    [stats, events],
  );

  const {
    showAutocomplete,
    autocompleteOptions,
    selectedIndex,
    handleSelect,
    handleKeyDown,
  } = useSearchAutocomplete(searchQuery, searchFilters);

  const [eventTypeFilter, setEventTypeFilter] = useState<string[]>(
    Object.values(EVENT_TYPE_GROUPS).flat(),
  );
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<
    string | null
  >(null);
  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(
    null,
  );
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const {
    timeMode,
    relativeTime,
    absoluteStart,
    absoluteEnd,
    isLiveMode,
    clearTime,
    elapsedLabel,
    showTimeControls,
    setAbsoluteStart,
    setIsLiveMode,
    setShowTimeControls,
    handleClearAll,
    handleTimeModeChange,
    applyAbsoluteRange,
    selectRelativeTime,
    setAbsoluteEndValue,
    setAbsoluteEndToNow,
  } = useMonitoringTimeRange(clearEvents, setTimeRange);
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set());
  const [showScrollButton, setShowScrollButton] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logStreamRef = useRef<HTMLDivElement>(null);
  const prevEventCountRef = useRef(events.length);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const filtersParam = params.get('filters');
      if (!filtersParam) return;
      const filters = JSON.parse(filtersParam);
      if (filters.trace) setSelectedTraceId(filters.trace[0] ?? null);
      if (filters.agent) setSelectedAgents(filters.agent);
      if (filters.conversation)
        setSelectedConversation(filters.conversation[0] ?? null);
      if (filters.tool) setSelectedToolCallId(filters.tool[0] ?? null);
    } catch {
      /* ignore malformed params */
    }
  }, []);

  useEffect(() => {
    if (events.length > prevEventCountRef.current) {
      const newIds = new Set(newEventIds);
      for (let i = prevEventCountRef.current; i < events.length; i++) {
        const event = events[i];
        newIds.add(`${event.timestamp}-${getEventType(event)}`);
      }
      setNewEventIds(newIds);

      setTimeout(() => {
        setNewEventIds(new Set());
      }, 5000);
    }
    prevEventCountRef.current = events.length;
  }, [events, newEventIds]);

  useEffect(() => {
    const logStream = logStreamRef.current;
    if (!logStream) return;

    const handleScroll = () => {
      const isAtBottom =
        logStream.scrollHeight - logStream.scrollTop - logStream.clientHeight <
        50;
      setShowScrollButton(!autoFollow && !isAtBottom);
    };

    logStream.addEventListener('scroll', handleScroll);
    return () => logStream.removeEventListener('scroll', handleScroll);
  }, [autoFollow]);

  const scrollToBottom = () => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleConversationClick = (
    conversationId: string,
    agentSlug: string,
  ) => {
    if (selectedConversation === conversationId) {
      setSelectedConversation(null);
    } else {
      setSelectedConversation(conversationId);
      setSelectedAgents([agentSlug]);
    }
  };

  const handleToolCallClick = (toolCallId: string) => {
    if (selectedToolCallId === toolCallId) {
      setSelectedToolCallId(null);
    } else {
      setSelectedToolCallId(toolCallId);
    }
  };

  const handleTraceClick = (traceId: string) => {
    if (selectedTraceId === traceId) {
      setSelectedTraceId(null);
    } else {
      setSelectedTraceId(traceId);
    }
  };

  const handleAgentClick = (agentSlug: string, event: React.MouseEvent) => {
    if (event.shiftKey) {
      setSelectedAgents((prev) =>
        prev.includes(agentSlug)
          ? prev.filter((a) => a !== agentSlug)
          : [...prev, agentSlug],
      );
    } else {
      setSelectedAgents((prev) =>
        prev.length === 1 && prev[0] === agentSlug ? [] : [agentSlug],
      );
    }
  };

  useEffect(() => {
    if (autoFollow && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [autoFollow]);

  const handleAutocompleteSelect = (
    option: (typeof autocompleteOptions)[0],
  ) => {
    const newQuery = handleSelect(option);
    setSearchQuery(newQuery);
    syncFiltersFromQuery(newQuery);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    const result = handleKeyDown(e);
    if (result) {
      setSearchQuery(result);
      syncFiltersFromQuery(result);
    }
  };

  const syncFiltersFromQuery = (query: string) => {
    const parsed = parseMonitoringSearchQuery(query);
    if (parsed.filters.agent) {
      setSelectedAgents(parsed.filters.agent);
    }
    if (parsed.filters.conversation?.[0]) {
      setSelectedConversation(parsed.filters.conversation[0]);
    }
    if (parsed.filters.tool?.[0]) {
      setSelectedToolCallId(parsed.filters.tool[0]);
    }
    if (parsed.filters.trace?.[0]) {
      setSelectedTraceId(parsed.filters.trace[0]);
    }
    setSearchQuery(parsed.text);
  };

  const filteredEvents = useMemo(
    () =>
      filterMonitoringEvents(events, {
        searchQuery,
        selectedAgents,
        selectedConversation,
        selectedToolCallId,
        selectedTraceId,
        eventTypeFilter,
      }),
    [
      eventTypeFilter,
      events,
      searchQuery,
      selectedAgents,
      selectedConversation,
      selectedToolCallId,
      selectedTraceId,
    ],
  );

  const toggleEventType = (group: string) => {
    const groupTypes = EVENT_TYPE_GROUPS[
      group as keyof typeof EVENT_TYPE_GROUPS
    ] as readonly string[];
    const allSelected = groupTypes.every((type) =>
      eventTypeFilter.includes(type),
    );

    if (allSelected) {
      // Remove all types in this group
      setEventTypeFilter((prev) => prev.filter((t) => !groupTypes.includes(t)));
    } else {
      // Add all types in this group
      setEventTypeFilter((prev) => [...new Set([...prev, ...groupTypes])]);
    }
  };

  return (
    <div className="monitoring-view">
      <MonitoringHeader
        stats={stats}
        connectionStatus={connectionStatus}
      >
          <MonitoringTimeControls
            clearTime={clearTime}
            timeMode={timeMode}
            relativeTime={relativeTime}
            absoluteStart={absoluteStart}
            absoluteEnd={absoluteEnd}
            isLiveMode={isLiveMode}
            elapsedLabel={elapsedLabel}
            showTimeControls={showTimeControls}
            onToggleControls={() => {
              setShowTimeControls(!showTimeControls);
              if (!showTimeControls && (clearTime || absoluteStart)) {
                handleTimeModeChange('absolute');
              }
            }}
            onTimeModeChange={handleTimeModeChange}
            onRelativeSelect={selectRelativeTime}
            onAbsoluteStartChange={setAbsoluteStart}
            onAbsoluteEndChange={setAbsoluteEndValue}
            onAbsoluteEndNow={setAbsoluteEndToNow}
            onApplyAbsolute={applyAbsoluteRange}
            onToggleLiveMode={() => setIsLiveMode(!isLiveMode)}
            onClearAll={handleClearAll}
          />
      </MonitoringHeader>

      <div className="monitoring-content">
        <MonitoringSidebar
          stats={stats}
          events={events}
          filteredEvents={filteredEvents}
          selectedAgents={selectedAgents}
          onAgentClick={handleAgentClick}
          onConversationClick={handleConversationClick}
          resolveModelName={(modelId) =>
            models.find((model) => model.id === modelId)?.name ||
            modelId ||
            'N/A'
          }
        />

        <div className="monitoring-main">
          <MonitoringLogControls
            eventTypeFilter={eventTypeFilter}
            onToggleEventType={toggleEventType}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onSearchKeyDown={handleSearchKeyDown}
            onSearchBlur={() => syncFiltersFromQuery(searchQuery)}
            showAutocomplete={showAutocomplete}
            autocompleteOptions={autocompleteOptions}
            selectedIndex={selectedIndex}
            onAutocompleteSelect={handleAutocompleteSelect}
          />

          <div className="log-controls">
            <div className="log-controls-row">
              <button
                onClick={() => setAutoFollow(!autoFollow)}
                className={`btn-toggle ${autoFollow ? 'active' : ''}`}
              >
                AUTO-FOLLOW
              </button>

              <MonitoringActiveFilters
                selectedAgents={selectedAgents}
                selectedConversation={selectedConversation}
                selectedToolCallId={selectedToolCallId}
                selectedTraceId={selectedTraceId}
                onRemoveAgent={(agent) =>
                  setSelectedAgents((prev) => prev.filter((a) => a !== agent))
                }
                onClearConversation={() => setSelectedConversation(null)}
                onClearToolCall={() => setSelectedToolCallId(null)}
                onClearTrace={() => setSelectedTraceId(null)}
              />
            </div>
          </div>

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
                  isNew={newEventIds.has(
                    `${event.timestamp}-${getEventType(event)}`,
                  )}
                  selectedTraceId={selectedTraceId}
                  selectedConversation={selectedConversation}
                  selectedToolCallId={selectedToolCallId}
                  onTraceClick={handleTraceClick}
                  onConversationClick={handleConversationClick}
                  onToolCallClick={handleToolCallClick}
                  onCopyResult={(text) => {
                    navigator.clipboard.writeText(text);
                    showToast('Copied to clipboard');
                  }}
                />
              ))
            )}
            <div ref={logEndRef} />
            {showScrollButton && (
              <button
                className="scroll-to-bottom"
                onClick={scrollToBottom}
                title="Scroll to bottom"
              >
                ↓
              </button>
            )}
          </div>
          <MetricsPanel />
        </div>
      </div>
    </div>
  );
}

export function MonitoringViewWithBoundary() {
  return (
    <MonitoringViewBoundary>
      <MonitoringView />
    </MonitoringViewBoundary>
  );
}
