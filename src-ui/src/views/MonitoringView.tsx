import { K } from '@shared/monitoring-keys';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MetricsPanel } from '../components/monitoring/MetricsPanel';
import { useModels } from '../contexts/ModelsContext';
import { useMonitoring } from '../contexts/MonitoringContext';
import { useToast } from '../contexts/ToastContext';
import { useSearchAutocomplete } from '../hooks/useSearchAutocomplete';
import { MonitoringViewBoundary } from './MonitoringErrorBoundary';
import { MonitoringLogControls } from './MonitoringLogControls';
import { MonitoringTimeControls } from './MonitoringTimeControls';
import { MonitoringActiveFilters } from './monitoring/MonitoringActiveFilters';
import { MonitoringHeader } from './monitoring/MonitoringHeader';
import { MonitoringLogStream } from './monitoring/MonitoringLogStream';
import { MonitoringSidebar } from './monitoring/MonitoringSidebar';
import { useMonitoringFilters } from './monitoring/useMonitoringFilters';
import { filterMonitoringEvents } from './monitoring/view-utils';
import { useMonitoringTimeRange } from './monitoring-time-range';
import { getEventType } from './monitoring-utils';
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
  const {
    eventTypeFilter,
    handleAgentClick,
    handleConversationClick,
    handleToolCallClick,
    handleTraceClick,
    searchQuery,
    selectedAgents,
    selectedConversation,
    selectedToolCallId,
    selectedTraceId,
    setSearchQuery,
    setSelectedAgents,
    setSelectedConversation,
    setSelectedToolCallId,
    setSelectedTraceId,
    syncFiltersFromQuery,
    toggleEventType,
  } = useMonitoringFilters();

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
  }, [
    setSelectedAgents,
    setSelectedConversation,
    setSelectedToolCallId,
    setSelectedTraceId,
  ]);

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

  return (
    <div className="monitoring-view">
      <MonitoringHeader stats={stats} connectionStatus={connectionStatus}>
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

          <MonitoringLogStream
            events={events}
            filteredEvents={filteredEvents}
            isLoading={isLoading}
            newEventIds={newEventIds}
            selectedTraceId={selectedTraceId}
            selectedConversation={selectedConversation}
            selectedToolCallId={selectedToolCallId}
            showScrollButton={showScrollButton}
            logEndRef={logEndRef}
            logStreamRef={logStreamRef}
            onTraceClick={handleTraceClick}
            onConversationClick={handleConversationClick}
            onToolCallClick={handleToolCallClick}
            onCopyResult={(text) => {
              navigator.clipboard.writeText(text);
              showToast('Copied to clipboard');
            }}
            onScrollToBottom={scrollToBottom}
          />
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
