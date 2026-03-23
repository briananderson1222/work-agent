import { useEffect, useMemo, useRef, useState } from 'react';
import { useModels } from '../contexts/ModelsContext';
import { MonitoringEvent, useMonitoring } from '../contexts/MonitoringContext';
import { useToast } from '../contexts/ToastContext';
import {
  parseSearchQuery,
  useSearchAutocomplete,
} from '../hooks/useSearchAutocomplete';
import { K, OP, SPAN } from '../monitoring-keys';

/** Derive a display-friendly event type from OTel attributes */
function getEventType(event: MonitoringEvent): string {
  const op = event[K.OP_NAME];
  const kind = event[K.SPAN_KIND];
  if (op === OP.INVOKE_AGENT && kind === SPAN.START) return 'agent-start';
  if (op === OP.INVOKE_AGENT && kind === SPAN.END) return 'agent-complete';
  if (op === OP.EXECUTE_TOOL && kind === SPAN.START) return 'tool-call';
  if (op === OP.EXECUTE_TOOL && kind === SPAN.END) return 'tool-result';
  if (op === OP.INVOKE_AGENT && kind === SPAN.LOG) return 'agent-health';
  if (event[K.REASONING_TEXT]) return 'reasoning';
  if (event[K.AT_EVENT_ID]) return 'agent-telemetry';
  return `${op}-${kind}`;
}

export function MonitoringView() {
  const { stats, events, clearEvents, setTimeRange } = useMonitoring();
  const { showToast } = useToast();
  const models = useModels();
  const [autoFollow, setAutoFollow] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Search autocomplete
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

  // Event type groups
  const eventTypeGroups = {
    Agent: ['agent-start', 'agent-complete'],
    Tool: ['tool-call', 'tool-result'],
    Reasoning: ['reasoning'],
    Planning: ['planning'],
    Health: ['agent-health'],
  };

  const [eventTypeFilter, setEventTypeFilter] = useState<string[]>(
    Object.values(eventTypeGroups).flat(),
  );
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<
    string | null
  >(null);
  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(
    null,
  );
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [timeMode, setTimeMode] = useState<'relative' | 'absolute'>('absolute');
  const [relativeTime, setRelativeTime] = useState<
    '5m' | '15m' | '1h' | '6h' | '24h' | '7d' | '30d'
  >('5m');
  const [absoluteStart, setAbsoluteStart] = useState<string>('');
  const [absoluteEnd, setAbsoluteEnd] = useState<string>('');
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [clearTime, setClearTime] = useState<Date | null>(null);
  const [elapsedLabel, setElapsedLabel] = useState<string>('');

  const handleClearAll = () => {
    clearEvents();
    const now = new Date();
    setClearTime(now);
    setTimeRange(now, now, true);
    setIsLiveMode(true);
    setTimeMode('absolute');
    // Update absolute inputs
    const localDateTime = new Date(
      now.getTime() - now.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 16);
    setAbsoluteStart(localDateTime);
    setAbsoluteEnd(localDateTime);
  };

  // Update absolute end time when in live mode
  useEffect(() => {
    if (!isLiveMode) return;

    const updateEndTime = () => {
      const now = new Date();
      const localDateTime = new Date(
        now.getTime() - now.getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16);
      setAbsoluteEnd(localDateTime);
    };

    updateEndTime();
    const interval = setInterval(updateEndTime, 1000);
    return () => clearInterval(interval);
  }, [isLiveMode]);

  // Update elapsed time label
  useEffect(() => {
    const startTime =
      clearTime ||
      (timeMode === 'absolute' && absoluteStart
        ? new Date(absoluteStart)
        : null);
    if (!startTime || !isLiveMode) return;

    const updateLabel = () => {
      const elapsed = Date.now() - startTime.getTime();
      const seconds = Math.floor(elapsed / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) {
        setElapsedLabel(`Last ${days} day${days > 1 ? 's' : ''}`);
      } else if (hours > 0) {
        setElapsedLabel(`Last ${hours} hour${hours > 1 ? 's' : ''}`);
      } else if (minutes > 0) {
        setElapsedLabel(`Last ${minutes} min`);
      } else {
        setElapsedLabel(`Last ${seconds} sec`);
      }
    };

    updateLabel();
    const interval = setInterval(updateLabel, 1000);
    return () => clearInterval(interval);
  }, [clearTime, timeMode, absoluteStart, isLiveMode]);

  // When switching to absolute mode, initialize start time from current relative time
  const handleTimeModeChange = (mode: 'relative' | 'absolute') => {
    if (mode === 'absolute' && !absoluteStart) {
      const ms =
        relativeTime === '5m'
          ? 5 * 60 * 1000
          : relativeTime === '15m'
            ? 15 * 60 * 1000
            : relativeTime === '1h'
              ? 60 * 60 * 1000
              : relativeTime === '6h'
                ? 6 * 60 * 60 * 1000
                : relativeTime === '24h'
                  ? 24 * 60 * 60 * 1000
                  : relativeTime === '7d'
                    ? 7 * 24 * 60 * 60 * 1000
                    : 30 * 24 * 60 * 60 * 1000;
      const start = new Date(Date.now() - ms);
      const localDateTime = new Date(
        start.getTime() - start.getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16);
      setAbsoluteStart(localDateTime);
    }
    setTimeMode(mode);
  };
  const [showTimeControls, setShowTimeControls] = useState(false);
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set());
  const [showScrollButton, setShowScrollButton] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logStreamRef = useRef<HTMLDivElement>(null);
  const prevEventCountRef = useRef(events.length);

  // Initialize with default time range
  useEffect(() => {
    const ms = 5 * 60 * 1000; // 5 minutes
    const now = new Date();
    const start = new Date(now.getTime() - ms);
    setTimeRange(start, now, true);

    // Set absolute inputs
    const localStart = new Date(
      start.getTime() - start.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 16);
    const localEnd = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setAbsoluteStart(localStart);
    setAbsoluteEnd(localEnd);
    setTimeMode('relative');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTimeRange]); // Only run on mount

  // Update time range when live mode changes
  useEffect(() => {
    if (timeMode === 'relative') {
      const ms =
        relativeTime === '5m'
          ? 5 * 60 * 1000
          : relativeTime === '15m'
            ? 15 * 60 * 1000
            : relativeTime === '1h'
              ? 60 * 60 * 1000
              : relativeTime === '6h'
                ? 6 * 60 * 60 * 1000
                : relativeTime === '24h'
                  ? 24 * 60 * 60 * 1000
                  : relativeTime === '7d'
                    ? 7 * 24 * 60 * 60 * 1000
                    : 30 * 24 * 60 * 60 * 1000;
      const now = new Date();
      const start = new Date(now.getTime() - ms);
      setTimeRange(start, now, isLiveMode);
    } else if (absoluteStart) {
      const start = new Date(absoluteStart);
      const end = absoluteEnd ? new Date(absoluteEnd) : new Date();
      setTimeRange(start, end, isLiveMode);
    }
  }, [
    isLiveMode,
    absoluteEnd,
    absoluteStart,
    relativeTime,
    setTimeRange,
    timeMode,
  ]);

  // Track new events for animation
  useEffect(() => {
    if (events.length > prevEventCountRef.current) {
      const newIds = new Set(newEventIds);
      // Add IDs of new events (use timestamp + type as ID)
      for (let i = prevEventCountRef.current; i < events.length; i++) {
        const event = events[i];
        newIds.add(`${event.timestamp}-${getEventType(event)}`);
      }
      setNewEventIds(newIds);

      // Remove animation class after 5 seconds
      setTimeout(() => {
        setNewEventIds(new Set());
      }, 5000);
    }
    prevEventCountRef.current = events.length;
  }, [events, newEventIds]);

  // Detect if user is at bottom
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
    // Toggle filter on conversation
    if (selectedConversation === conversationId) {
      setSelectedConversation(null);
    } else {
      setSelectedConversation(conversationId);
      setSelectedAgents([agentSlug]); // Also filter by agent
    }
  };

  const handleToolCallClick = (toolCallId: string) => {
    // Toggle filter on tool call
    if (selectedToolCallId === toolCallId) {
      setSelectedToolCallId(null);
    } else {
      setSelectedToolCallId(toolCallId);
    }
  };

  const handleTraceClick = (traceId: string) => {
    // Toggle filter on trace ID
    if (selectedTraceId === traceId) {
      setSelectedTraceId(null);
    } else {
      setSelectedTraceId(traceId);
    }
  };

  const handleAgentClick = (agentSlug: string, event: React.MouseEvent) => {
    if (event.shiftKey) {
      // Multi-select with shift
      setSelectedAgents((prev) =>
        prev.includes(agentSlug)
          ? prev.filter((a) => a !== agentSlug)
          : [...prev, agentSlug],
      );
    } else {
      // Single click: toggle if only one selected, otherwise narrow to clicked
      setSelectedAgents((prev) =>
        prev.length === 1 && prev[0] === agentSlug
          ? []
          : [agentSlug],
      );
    }
  };

  // Generate consistent color for agent
  const getAgentColor = (agentSlug: string) => {
    // Avoid filter colors: blue (#3b82f6), orange (#f59e0b), cyan (#06b6d4), purple (#8b5cf6)
    const colors = [
      '#ef4444',
      '#22c55e',
      '#a855f7',
      '#f97316',
      '#14b8a6',
      '#ec4899',
    ];
    const hash = agentSlug
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Generate consistent color for conversation ID
  const getConversationColor = (conversationId: string) => {
    const colors = [
      '#3b82f6',
      '#8b5cf6',
      '#ec4899',
      '#f59e0b',
      '#10b981',
      '#06b6d4',
    ];
    const hash = conversationId
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
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
    const parsed = parseSearchQuery(query, [
      'agent',
      'conversation',
      'tool',
      'trace',
    ]);
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
    // Update search query to only contain text (remove filter syntax)
    setSearchQuery(parsed.text);
  };

  const filteredEvents = events
    .filter((event) => {
      const parsed = parseSearchQuery(searchQuery, [
        'agent',
        'conversation',
        'tool',
        'trace',
      ]);
      // Check both parsed query agents and selectedAgents from sidebar clicks
      const agentsToFilter = parsed.filters.agent || selectedAgents;
      if (
        agentsToFilter.length > 0 &&
        !agentsToFilter.includes(event[K.AGENT_SLUG] || '')
      )
        return false;
      // Check both parsed conversation and selectedConversation from sidebar clicks
      const conversationToFilter =
        parsed.filters.conversation?.[0] || selectedConversation;
      if (conversationToFilter && event[K.CONVERSATION_ID] !== conversationToFilter)
        return false;
      // Check tool call ID filter
      const toolCallIdToFilter = parsed.filters.tool?.[0] || selectedToolCallId;
      if (toolCallIdToFilter && event[K.TOOL_CALL_ID] !== toolCallIdToFilter)
        return false;
      // Check trace ID filter
      const traceIdToFilter = parsed.filters.trace?.[0] || selectedTraceId;
      if (traceIdToFilter && event[K.TRACE_ID] !== traceIdToFilter) return false;
      if (eventTypeFilter.length > 0 && !eventTypeFilter.includes(getEventType(event)))
        return false;
      // Only apply text filter if it's not just a filter key with colon
      const isIncompleteFilter = /^(agent|conversation|tool|trace):$/.test(
        parsed.text.trim(),
      );
      if (
        parsed.text &&
        !isIncompleteFilter &&
        !JSON.stringify(event).toLowerCase().includes(parsed.text.toLowerCase())
      )
        return false;
      return true;
    })
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    ); // Oldest to newest

  const toggleEventType = (group: string) => {
    const groupTypes = eventTypeGroups[group as keyof typeof eventTypeGroups];
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
      {/* Header Stats */}
      <div className="monitoring-header">
        <div className="monitoring-title">
          <h1>MONITORING</h1>
          <div className="status-badge">
            <span className="status-dot"></span>
            Connected
          </div>
        </div>

        <div className="monitoring-stats">
          <div className="stat-item">
            <span className="stat-label">Active:</span>
            <span className="stat-value">
              {stats?.summary.activeAgents || 0}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Running:</span>
            <span className="stat-value">
              {stats?.summary.runningAgents || 0}
            </span>
          </div>
        </div>

        <div className="monitoring-actions">
          <div className="time-filter-wrapper">
            <button
              onClick={() => {
                setShowTimeControls(!showTimeControls);
                // Don't change tab if already open, otherwise set based on current mode
                if (!showTimeControls) {
                  if (timeMode === 'relative' && !clearTime && !absoluteStart) {
                    // Stay in relative mode
                  } else if (clearTime || absoluteStart) {
                    setTimeMode('absolute');
                  }
                }
              }}
              className="time-filter-button"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                }}
              >
                <span>
                  {(clearTime || (timeMode === 'absolute' && absoluteStart)) &&
                  isLiveMode
                    ? elapsedLabel
                    : clearTime
                      ? 'Custom Range'
                      : timeMode === 'relative'
                        ? `Last ${relativeTime === '5m' ? '5 min' : relativeTime === '15m' ? '15 min' : relativeTime === '1h' ? '1 hour' : relativeTime === '6h' ? '6 hours' : relativeTime === '24h' ? '24 hours' : relativeTime === '7d' ? '7 days' : '30 days'}`
                        : 'Custom Range'}
                </span>
                {(() => {
                  if (clearTime && !isLiveMode) {
                    // Show fixed range when cleared but not live
                    return (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          opacity: 0.7,
                          marginTop: '2px',
                        }}
                      >
                        {clearTime.toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        →{' '}
                        {new Date().toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    );
                  } else if (timeMode === 'relative' && !clearTime) {
                    // Show relative range
                    const ms =
                      relativeTime === '5m'
                        ? 5 * 60 * 1000
                        : relativeTime === '15m'
                          ? 15 * 60 * 1000
                          : relativeTime === '1h'
                            ? 60 * 60 * 1000
                            : relativeTime === '6h'
                              ? 6 * 60 * 60 * 1000
                              : relativeTime === '24h'
                                ? 24 * 60 * 60 * 1000
                                : relativeTime === '7d'
                                  ? 7 * 24 * 60 * 60 * 1000
                                  : 30 * 24 * 60 * 60 * 1000;
                    const start = new Date(Date.now() - ms);
                    return (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          opacity: 0.7,
                          marginTop: '2px',
                        }}
                      >
                        {start.toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        →{' '}
                        {isLiveMode
                          ? 'now'
                          : new Date().toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                      </span>
                    );
                  } else if (
                    timeMode === 'absolute' &&
                    absoluteStart &&
                    !clearTime
                  ) {
                    // Show absolute range
                    return (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          opacity: 0.7,
                          marginTop: '2px',
                        }}
                      >
                        {new Date(absoluteStart).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        →{' '}
                        {absoluteEnd
                          ? new Date(absoluteEnd).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'now'}
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
            </button>

            {showTimeControls && (
              <div className="time-controls-dropdown">
                <div className="time-mode-tabs">
                  <button
                    className={timeMode === 'relative' ? 'active' : ''}
                    onClick={() => handleTimeModeChange('relative')}
                  >
                    Relative
                  </button>
                  <button
                    className={timeMode === 'absolute' ? 'active' : ''}
                    onClick={() => handleTimeModeChange('absolute')}
                  >
                    Absolute
                  </button>
                </div>

                {timeMode === 'relative' ? (
                  <div className="relative-time-options">
                    {[
                      {
                        value: '5m',
                        label: 'Last 5 minutes',
                        ms: 5 * 60 * 1000,
                      },
                      {
                        value: '15m',
                        label: 'Last 15 minutes',
                        ms: 15 * 60 * 1000,
                      },
                      { value: '1h', label: 'Last 1 hour', ms: 60 * 60 * 1000 },
                      {
                        value: '6h',
                        label: 'Last 6 hours',
                        ms: 6 * 60 * 60 * 1000,
                      },
                      {
                        value: '24h',
                        label: 'Last 24 hours',
                        ms: 24 * 60 * 60 * 1000,
                      },
                      {
                        value: '7d',
                        label: 'Last 7 days',
                        ms: 7 * 24 * 60 * 60 * 1000,
                      },
                      {
                        value: '30d',
                        label: 'Last 30 days',
                        ms: 30 * 24 * 60 * 60 * 1000,
                      },
                    ].map((option) => {
                      const now = new Date();
                      const start = new Date(now.getTime() - option.ms);
                      return (
                        <button
                          key={option.value}
                          className={
                            relativeTime === option.value ? 'active' : ''
                          }
                          onClick={() => {
                            setRelativeTime(
                              option.value as
                                | '5m'
                                | '15m'
                                | '1h'
                                | '6h'
                                | '24h'
                                | '7d'
                                | '30d',
                            );
                            setTimeMode('relative');
                            setClearTime(null);
                            setShowTimeControls(false);
                          }}
                        >
                          <div className="option-label">{option.label}</div>
                          <div className="option-time">
                            {start.toLocaleString()} → now
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="absolute-time-inputs">
                    <label>
                      Start
                      <input
                        type="datetime-local"
                        value={absoluteStart}
                        onChange={(e) => setAbsoluteStart(e.target.value)}
                      />
                    </label>
                    <label>
                      End
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="datetime-local"
                          value={absoluteEnd}
                          onChange={(e) => {
                            setAbsoluteEnd(e.target.value);
                            if (isLiveMode) setIsLiveMode(false);
                          }}
                          disabled={isLiveMode}
                          placeholder="Leave empty for now"
                          style={{
                            flex: 1,
                            opacity: isLiveMode ? 0.6 : 1,
                            cursor: isLiveMode ? 'not-allowed' : 'text',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const now = new Date();
                            const localDateTime = new Date(
                              now.getTime() - now.getTimezoneOffset() * 60000,
                            )
                              .toISOString()
                              .slice(0, 16);
                            setAbsoluteEnd(localDateTime);
                            if (isLiveMode) setIsLiveMode(false);
                          }}
                          disabled={isLiveMode}
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '4px',
                            color: 'var(--text-primary)',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            cursor: isLiveMode ? 'not-allowed' : 'pointer',
                            opacity: isLiveMode ? 0.6 : 1,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Now
                        </button>
                      </div>
                    </label>
                    <button
                      className="apply-button"
                      onClick={() => {
                        if (absoluteStart) {
                          const start = new Date(absoluteStart);
                          const end = absoluteEnd
                            ? new Date(absoluteEnd)
                            : new Date();
                          setTimeRange(start, end, isLiveMode);
                          setClearTime(null);
                        }
                        setShowTimeControls(false);
                      }}
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => setIsLiveMode(!isLiveMode)}
            className={`live-mode-toggle ${isLiveMode ? 'active' : ''}`}
            title={
              isLiveMode
                ? 'Live mode: streaming real-time events'
                : 'Historical mode: fixed time range'
            }
          >
            <span className="live-dot"></span>
            LIVE
          </button>
          <button onClick={handleClearAll} className="btn-secondary">
            CLEAR ALL
          </button>
        </div>
      </div>

      <div className="monitoring-content">
        {/* Left Sidebar - Agents */}
        <div className="monitoring-sidebar">
          <div className="sidebar-header">
            <h3>AGENTS</h3>
            <span className="agent-count">
              {(() => {
                const activeCount = stats?.agents.length || 0;
                const historicalSlugs = [
                  ...new Set(
                    filteredEvents
                      .map((e) => e[K.AGENT_SLUG])
                      .filter((s): s is string => !!s),
                  ),
                ];
                const historicalCount = historicalSlugs.filter(
                  (slug) => !stats?.agents.some((a) => a.slug === slug),
                ).length;
                return `${activeCount} Active${historicalCount > 0 ? ` • ${historicalCount} Historical` : ''}`;
              })()}
            </span>
          </div>

          <div className="agent-list">
            {/* Active Agents */}
            {stats?.agents.map((agent) => {
              const runningConversations = events
                .filter(
                  (e) =>
                    e[K.AGENT_SLUG] === agent.slug &&
                    getEventType(e) === 'agent-start' &&
                    e[K.CONVERSATION_ID],
                )
                .reduce(
                  (acc, e) => {
                    if (
                      e[K.CONVERSATION_ID] &&
                      !acc.some((c) => c.id === e[K.CONVERSATION_ID])
                    ) {
                      acc.push({
                        id: e[K.CONVERSATION_ID] as string,
                        color: getConversationColor(e[K.CONVERSATION_ID] as string),
                      });
                    }
                    return acc;
                  },
                  [] as Array<{ id: string; color: string }>,
                );

              return (
                <div
                  key={agent.slug}
                  className={`agent-card status-${agent.status} ${selectedAgents.includes(agent.slug) ? 'selected' : ''}`}
                  onClick={(e) => handleAgentClick(agent.slug, e)}
                  style={{
                    borderLeftColor: getAgentColor(agent.slug),
                    background: selectedAgents.includes(agent.slug)
                      ? `color-mix(in srgb, ${getAgentColor(agent.slug)} 10%, var(--bg-secondary))`
                      : undefined,
                  }}
                >
                  <div className="agent-header">
                    <span className="agent-name">
                      <span
                        className={`health-dot ${agent.healthy === false ? 'unhealthy' : agent.healthy === true ? 'healthy' : 'unknown'}`}
                        title={
                          agent.healthy === false
                            ? 'Unhealthy'
                            : agent.healthy === true
                              ? 'Healthy'
                              : 'Status unknown'
                        }
                      ></span>
                      {agent.name}
                    </span>
                    <span className={`agent-status ${agent.status}`}>
                      {agent.status.toUpperCase()}
                    </span>
                  </div>
                  {agent.status === 'running' &&
                    runningConversations.length > 0 && (
                      <div className="running-conversations">
                        <div className="conversations-label">Active Chats</div>
                        {runningConversations.map((conv, idx) => (
                          <div
                            key={idx}
                            className="conversation-item"
                            style={{ borderLeftColor: conv.color }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConversationClick(conv.id, agent.slug);
                            }}
                          >
                            <span className="conversation-id">
                              {conv.id.split(':').pop()?.substring(0, 8)}...
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  <div className="agent-meta">
                    <div className="meta-item">
                      <span className="meta-label">Model:</span>
                      <span className="meta-value">
                        {models.find((m) => m.id === agent.model)?.name ||
                          agent.model ||
                          'N/A'}
                      </span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Messages:</span>
                      <span className="meta-value">{agent.messageCount}</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Cost:</span>
                      <span className="meta-value">
                        ${agent.cost.toFixed(3)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Historical Agents (from events but not currently loaded) */}
            {(() => {
              const historicalSlugs = [
                ...new Set(
                  filteredEvents
                    .map((e) => e[K.AGENT_SLUG])
                    .filter((s): s is string => !!s),
                ),
              ].filter((slug) => !stats?.agents.some((a) => a.slug === slug));

              if (historicalSlugs.length === 0) return null;

              return (
                <>
                  <div
                    style={{
                      padding: '0.75rem 0.5rem 0.5rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      borderTop: '1px solid var(--border-primary)',
                      marginTop: '0.5rem',
                    }}
                  >
                    Historical
                  </div>
                  {historicalSlugs.map((slug) => {
                    const eventCount = filteredEvents.filter(
                      (e) => e[K.AGENT_SLUG] === slug,
                    ).length;
                    return (
                      <div
                        key={slug}
                        className={`agent-card ${selectedAgents.includes(slug) ? 'selected' : ''}`}
                        onClick={(e) => handleAgentClick(slug, e)}
                        style={{
                          borderLeftColor: getAgentColor(slug),
                          background: selectedAgents.includes(slug)
                            ? `color-mix(in srgb, ${getAgentColor(slug)} 10%, var(--bg-secondary))`
                            : undefined,
                          opacity: 0.7,
                        }}
                      >
                        <div className="agent-header">
                          <span className="agent-name">{slug}</span>
                          <span
                            className="agent-status"
                            style={{
                              background: 'var(--text-tertiary)',
                              color: 'var(--bg-secondary)',
                            }}
                          >
                            HISTORICAL
                          </span>
                        </div>
                        <div className="agent-meta">
                          <div className="meta-item">
                            <span className="meta-label">Events:</span>
                            <span className="meta-value">{eventCount}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
        </div>

        {/* Center - Log Stream */}
        <div className="monitoring-main">
          <div className="log-controls">
            <div className="log-controls-row">
              <div className="event-filters">
                {Object.keys(eventTypeGroups).map((group) => {
                  const groupTypes =
                    eventTypeGroups[group as keyof typeof eventTypeGroups];
                  const allSelected = groupTypes.every((type) =>
                    eventTypeFilter.includes(type),
                  );
                  return (
                    <button
                      key={group}
                      onClick={() => toggleEventType(group)}
                      className={`event-filter ${allSelected ? 'active' : ''}`}
                      data-type={group.toLowerCase()}
                    >
                      {group.toUpperCase()}
                    </button>
                  );
                })}
              </div>

              <div className="search-wrapper">
                <input
                  type="text"
                  placeholder="Search logs... (try: agent:name or conversation:id)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  onBlur={() => syncFiltersFromQuery(searchQuery)}
                  className="search-input"
                />
                {searchQuery && (
                  <button
                    className="search-clear"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                  >
                    ×
                  </button>
                )}

                {showAutocomplete && (
                  <div className="autocomplete-dropdown">
                    {autocompleteOptions.map((option, idx) => (
                      <div
                        key={idx}
                        className={`autocomplete-item ${idx === selectedIndex ? 'selected' : ''} ${option.isEmpty ? 'empty' : ''}`}
                        data-type={option.type}
                        onClick={() =>
                          !option.isEmpty && handleAutocompleteSelect(option)
                        }
                      >
                        {option.isEmpty ? (
                          <div className="autocomplete-empty">
                            <div>{option.label}</div>
                            {option.emptyMessage && (
                              <div className="autocomplete-hint">
                                {option.emptyMessage}
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <span className="autocomplete-type">
                              {option.type}
                            </span>
                            {option.value}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => setAutoFollow(!autoFollow)}
                className={`btn-toggle ${autoFollow ? 'active' : ''}`}
              >
                AUTO-FOLLOW
              </button>
            </div>

            {(selectedAgents.length > 0 ||
              selectedConversation ||
              selectedToolCallId ||
              selectedTraceId) && (
              <div className="active-filters-inline">
                {selectedAgents.map((agent) => (
                  <span
                    key={agent}
                    className="filter-badge-inline"
                    style={{
                      borderLeft: `3px solid ${getAgentColor(agent)}`,
                      background: `color-mix(in srgb, ${getAgentColor(agent)} 15%, var(--bg-tertiary))`,
                    }}
                  >
                    agent:{agent}
                    <button
                      onClick={() =>
                        setSelectedAgents((prev) =>
                          prev.filter((a) => a !== agent),
                        )
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
                {selectedConversation && (
                  <span
                    className="filter-badge-inline"
                    style={{
                      borderLeft: `3px solid var(--event-agent-start)`,
                      background: `color-mix(in srgb, var(--event-agent-start) 15%, var(--bg-tertiary))`,
                    }}
                  >
                    conversation:
                    {selectedConversation.split(':').pop()?.substring(0, 8)}
                    <button onClick={() => setSelectedConversation(null)}>
                      ×
                    </button>
                  </span>
                )}
                {selectedToolCallId && (
                  <span
                    className="filter-badge-inline"
                    style={{
                      borderLeft: `3px solid var(--event-tool-call)`,
                      background: `color-mix(in srgb, var(--event-tool-call) 15%, var(--bg-tertiary))`,
                    }}
                  >
                    tool:{selectedToolCallId}
                    <button onClick={() => setSelectedToolCallId(null)}>
                      ×
                    </button>
                  </span>
                )}
                {selectedTraceId && (
                  <span
                    className="filter-badge-inline"
                    style={{
                      borderLeft: `3px solid var(--color-primary)`,
                      background: `color-mix(in srgb, var(--color-primary) 15%, var(--bg-tertiary))`,
                    }}
                  >
                    trace:...{selectedTraceId.slice(-8)}
                    <button onClick={() => setSelectedTraceId(null)}>×</button>
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="log-stream" ref={logStreamRef}>
            {filteredEvents.length === 0 ? (
              <div className="log-empty">
                <p>No events yet. Waiting for agent activity...</p>
              </div>
            ) : (
              filteredEvents.map((event, idx) => {
                const eventId = `${event.timestamp}-${getEventType(event)}`;
                const isNew = newEventIds.has(eventId);
                const agentColor = event[K.AGENT_SLUG]
                  ? getAgentColor(event[K.AGENT_SLUG] as string)
                  : undefined;
                return (
                  <div
                    key={idx}
                    className={`log-entry event-${getEventType(event)} agent-${event[K.AGENT_SLUG]} ${isNew ? 'new-event' : ''}`}
                    style={
                      agentColor
                        ? {
                            background: `color-mix(in srgb, ${agentColor} 8%, var(--bg-secondary))`,
                          }
                        : undefined
                    }
                  >
                    <div className="log-row">
                      <div className="log-timestamp-col">
                        <div
                          className="log-timestamp"
                          title={
                            event.timestamp
                              ? new Date(event.timestamp).toLocaleString(
                                  'en-US',
                                  {
                                    dateStyle: 'full',
                                    timeStyle: 'long',
                                  },
                                )
                              : 'No timestamp'
                          }
                        >
                          {event.timestamp
                            ? new Date(event.timestamp).toLocaleTimeString()
                            : '-'}
                          {!!event[K.TIMESTAMP_MS] && (
                            <span
                              style={{
                                fontSize: '0.7em',
                                opacity: 0.6,
                                marginLeft: '0.25rem',
                              }}
                            >
                              .
                              {String(event[K.TIMESTAMP_MS] % 1000).padStart(
                                3,
                                '0',
                              )}
                            </span>
                          )}
                        </div>
                        {!!event[K.TRACE_ID] && (
                          <button
                            className={`trace-pill ${selectedTraceId === event[K.TRACE_ID] ? 'selected' : ''}`}
                            onClick={() => handleTraceClick(event[K.TRACE_ID] as string)}
                            title={`Trace ID: ${event[K.TRACE_ID]}\nClick to filter`}
                            style={
                              selectedTraceId === event[K.TRACE_ID] && agentColor
                                ? {
                                    borderColor: agentColor,
                                    color: agentColor,
                                  }
                                : undefined
                            }
                          >
                            {(event[K.TRACE_ID] as string).slice(-8)}
                          </button>
                        )}
                      </div>
                      <div className="log-type">{getEventType(event).toUpperCase()}</div>
                      <div className="log-agent">{event[K.AGENT_SLUG] || '-'}</div>

                      <div className="log-data">
                        {!!event[K.CONVERSATION_ID] && (
                          <span className="log-inline">
                            <span className="meta-label">Conversation:</span>
                            <button
                              className={`pill-button ${selectedConversation === event[K.CONVERSATION_ID] ? 'selected' : ''}`}
                              style={{
                                backgroundColor: 'var(--event-agent-start)',
                                borderColor: 'var(--event-agent-start)',
                              }}
                              onClick={() =>
                                handleConversationClick(
                                  event[K.CONVERSATION_ID] as string,
                                  event[K.AGENT_SLUG] as string,
                                )
                              }
                              title="Filter by conversation"
                            >
                              ...{(event[K.CONVERSATION_ID] as string).slice(-6)}
                            </button>
                          </span>
                        )}

                        {!!event[K.TOOL_CALL_ID] && (
                          <span className="log-inline">
                            <span className="meta-label">Tool Call:</span>
                            <button
                              className={`pill-button ${selectedToolCallId === event[K.TOOL_CALL_ID] ? 'selected' : ''}`}
                              onClick={() =>
                                handleToolCallClick(event[K.TOOL_CALL_ID] as string)
                              }
                              title="Filter by tool call ID"
                              style={{
                                background: 'var(--event-tool-call)',
                                borderColor: 'var(--event-tool-call)',
                                color: 'white',
                              }}
                            >
                              ...{(event[K.TOOL_CALL_ID] as string).slice(-6)}
                            </button>
                          </span>
                        )}

                        {!!event[K.TOOL_NAME] && (
                          <span className="log-inline">
                            <span className="meta-label">Tool:</span>
                            <span className="pill-badge tool-badge">
                              {event[K.TOOL_NAME] as string}
                            </span>
                          </span>
                        )}

                        {event[K.HEALTHY] !== undefined && (
                          <span className="log-inline">
                            <span className="meta-label">Status:</span>
                            <span
                              className={`pill-badge ${event[K.HEALTHY] ? 'health-ok' : 'health-error'}`}
                            >
                              {event[K.HEALTHY] ? '✓ Healthy' : '⚠ Unhealthy'}
                            </span>
                          </span>
                        )}

                        {!!(event[K.HEALTH_INTEGRATIONS] as Array<unknown> | undefined) &&
                          (event[K.HEALTH_INTEGRATIONS] as Array<{ type: string; id: string; connected: boolean; metadata?: { transport: string; toolCount: number } }>).length > 0 && (
                            <span className="log-inline">
                              <span className="meta-label">Integrations:</span>
                              {(event[K.HEALTH_INTEGRATIONS] as Array<{ type: string; id: string; connected: boolean; metadata?: { transport: string; toolCount: number } }>).map((integration, idx) => (
                                <span
                                  key={idx}
                                  className={`pill-badge ${integration.connected ? 'health-ok' : 'health-error'}`}
                                  title={`${integration.type.toUpperCase()} - ${integration.connected ? 'Connected' : 'Disconnected'}${integration.metadata ? `\nTransport: ${integration.metadata.transport}\nTools: ${integration.metadata.toolCount}` : ''}`}
                                >
                                  {integration.id}
                                  {integration.metadata &&
                                    ` (${integration.metadata.toolCount} tools)`}
                                </span>
                              ))}
                            </span>
                          )}

                        {!!(event[K.FINISH_REASONS] as string[] | undefined)?.[0] && (
                          <span className="log-inline">
                            <span className="meta-label">Reason:</span>
                            <span className="pill-badge">{(event[K.FINISH_REASONS] as string[])[0]}</span>
                            {(event[K.FINISH_REASONS] as string[])[0] === 'tool-calls' &&
                              !!event[K.AGENT_MAX_STEPS] && (
                                <span
                                  style={{
                                    marginLeft: '0.5rem',
                                    fontSize: '0.75rem',
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  (Hit max steps limit: {event[K.AGENT_STEPS]}/
                                  {event[K.AGENT_MAX_STEPS]})
                                </span>
                              )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Collapsible sections */}
                    {!!event[K.REASONING_TEXT] && (
                      <details
                        className="log-details"
                        style={{ marginTop: '0.75rem' }}
                      >
                        <summary>
                          Output
                          <span
                            style={{
                              fontSize: '0.75rem',
                              marginLeft: '0.5rem',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            ({(event[K.REASONING_TEXT] as string).length} chars)
                          </span>
                        </summary>
                        <pre
                          style={{
                            whiteSpace: 'pre-wrap',
                            maxHeight: '400px',
                            overflow: 'auto',
                          }}
                        >
                          {event[K.REASONING_TEXT] as string}
                        </pre>
                      </details>
                    )}

                    {!!(event[K.HEALTH_CHECKS] as Record<string, boolean> | undefined) && (
                      <details className="log-details">
                        <summary>Health Checks</summary>
                        <div style={{ padding: '0.5rem 0' }}>
                          {Object.entries(event[K.HEALTH_CHECKS] as Record<string, boolean>).map(([key, value]) => (
                            <div
                              key={key}
                              style={{
                                display: 'flex',
                                gap: '0.5rem',
                                marginBottom: '0.25rem',
                              }}
                            >
                              <span style={{ color: 'var(--text-secondary)' }}>
                                {key}:
                              </span>
                              <span
                                style={{
                                  color: value
                                    ? 'var(--success)'
                                    : 'var(--error)',
                                }}
                              >
                                {value ? '✓' : '✗'}
                              </span>
                            </div>
                          ))}
                          {!!(event[K.HEALTH_INTEGRATIONS] as Array<unknown> | undefined) &&
                            (event[K.HEALTH_INTEGRATIONS] as Array<{ type: string; id: string; connected: boolean; metadata?: { transport: string; toolCount: number } }>).length > 0 && (
                              <div
                                style={{
                                  marginTop: '1rem',
                                  paddingTop: '0.5rem',
                                  borderTop: '1px solid var(--border-primary)',
                                }}
                              >
                                <div
                                  style={{
                                    color: 'var(--text-secondary)',
                                    marginBottom: '0.5rem',
                                  }}
                                >
                                  Integrations:
                                </div>
                                {(event[K.HEALTH_INTEGRATIONS] as Array<{ type: string; id: string; connected: boolean; metadata?: { transport: string; toolCount: number } }>).map((integration, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      marginLeft: '1rem',
                                      marginBottom: '0.5rem',
                                    }}
                                  >
                                    <div style={{ fontWeight: 500 }}>
                                      {integration.id} ({integration.type})
                                      <span
                                        style={{
                                          color: integration.connected
                                            ? 'var(--success)'
                                            : 'var(--error)',
                                          marginLeft: '0.5rem',
                                        }}
                                      >
                                        {integration.connected
                                          ? '✓ Connected'
                                          : '✗ Disconnected'}
                                      </span>
                                    </div>
                                    {integration.metadata && (
                                      <div
                                        style={{
                                          fontSize: '0.8rem',
                                          color: 'var(--text-secondary)',
                                          marginTop: '0.25rem',
                                        }}
                                      >
                                        Transport:{' '}
                                        {integration.metadata.transport} |
                                        Tools: {integration.metadata.toolCount}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                      </details>
                    )}

                    {(() => {
                      const args = event[K.TOOL_CALL_ARGS];
                      if (!args) return null;
                      const hasContent = typeof args === 'string' ? (args as string).length > 0 : Object.keys(args as Record<string, unknown>).length > 0;
                      if (!hasContent) return null;
                      const argsStr = typeof args === 'string' ? (args as string) : JSON.stringify(args, null, 2);
                      const argsLabel = typeof args === 'string' ? `${(args as string).length} chars` : `${Object.keys(args as Record<string, unknown>).length} params`;
                      return (
                        <details className="log-details">
                          <summary>
                            Input ({argsLabel})
                          </summary>
                          <pre>{argsStr}</pre>
                        </details>
                      );
                    })()}

                    {!!event[K.TOOL_CALL_RESULT] && (
                      <details className="log-details">
                        <summary>
                          Result
                          <button
                            className="export-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(
                                JSON.stringify(event[K.TOOL_CALL_RESULT], null, 2),
                              );
                              showToast('Copied to clipboard');
                            }}
                            title="Copy to clipboard"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect
                                x="9"
                                y="9"
                                width="13"
                                height="13"
                                rx="2"
                                ry="2"
                              ></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                          </button>
                        </summary>
                        <pre>{JSON.stringify(event[K.TOOL_CALL_RESULT], null, 2)}</pre>
                      </details>
                    )}

                    {getEventType(event) === 'agent-complete' &&
                      !!(event[K.ARTIFACTS] as Array<unknown> | undefined) &&
                      (() => {
                        const artifacts = event[K.ARTIFACTS] as Array<{ type: string; name?: string; content?: unknown }>;
                        const textArtifacts = artifacts.filter(
                          (a) => a.type === 'text',
                        );
                        const finalOutput =
                          textArtifacts.length > 0
                            ? String(textArtifacts[textArtifacts.length - 1].content ?? '')
                            : null;
                        const toolCalls = artifacts.filter(
                          (a) => a.type === 'tool-call',
                        );

                        return (
                          <>
                            {finalOutput &&
                              (() => {
                                const needsExpansion = finalOutput.length > 200;

                                return (
                                  <details className="log-details">
                                    <summary>
                                      Output
                                      {needsExpansion && (
                                        <span
                                          style={{
                                            fontSize: '0.75rem',
                                            marginLeft: '0.5rem',
                                            color: 'var(--text-secondary)',
                                          }}
                                        >
                                          ({finalOutput.length} chars)
                                        </span>
                                      )}
                                    </summary>
                                    <pre
                                      style={{
                                        whiteSpace: 'pre-wrap',
                                        maxHeight: '400px',
                                        overflow: 'auto',
                                      }}
                                    >
                                      {finalOutput}
                                    </pre>
                                  </details>
                                );
                              })()}
                            {toolCalls.length > 0 && (
                              <details className="log-details">
                                <summary>
                                  Tools Used ({toolCalls.length})
                                </summary>
                                <div style={{ padding: '0.5rem 0' }}>
                                  {toolCalls.map((tool, idx) => (
                                    <div
                                      key={idx}
                                      style={{
                                        marginBottom: '0.5rem',
                                        paddingBottom: '0.5rem',
                                        borderBottom:
                                          idx < toolCalls.length - 1
                                            ? '1px solid var(--border-primary)'
                                            : 'none',
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontWeight: 500,
                                          color: 'var(--event-tool-call)',
                                        }}
                                      >
                                        {tool.name}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                            {event[K.INPUT_TOKENS] !== undefined || event[K.INPUT_CHARS] !== undefined ? (
                              <details className="log-details">
                                <summary>Usage & Stats</summary>
                                <div
                                  style={{
                                    padding: '0.5rem 0',
                                    display: 'grid',
                                    gridTemplateColumns: 'auto 1fr',
                                    gap: '0.5rem',
                                    fontSize: '0.9em',
                                  }}
                                >
                                  {/* Character Counts */}
                                  {event[K.INPUT_CHARS] !== undefined && (
                                    <>
                                      <div
                                        style={{
                                          color: 'var(--text-secondary)',
                                        }}
                                      >
                                        Input:
                                      </div>
                                      <div style={{ fontFamily: 'monospace' }}>
                                        {(event[K.INPUT_CHARS] as number).toLocaleString()}{' '}
                                        chars
                                      </div>
                                    </>
                                  )}

                                  {event[K.OUTPUT_CHARS] !== undefined && (
                                    <>
                                      <div
                                        style={{
                                          color: 'var(--text-secondary)',
                                        }}
                                      >
                                        Output:
                                      </div>
                                      <div style={{ fontFamily: 'monospace' }}>
                                        {(event[K.OUTPUT_CHARS] as number).toLocaleString()}{' '}
                                        chars
                                      </div>
                                    </>
                                  )}

                                  {event[K.INPUT_CHARS] !== undefined &&
                                    event[K.OUTPUT_CHARS] !== undefined && (
                                      <>
                                        <div
                                          style={{
                                            color: 'var(--text-secondary)',
                                            fontWeight: 500,
                                          }}
                                        >
                                          Total:
                                        </div>
                                        <div
                                          style={{
                                            fontFamily: 'monospace',
                                            fontWeight: 500,
                                          }}
                                        >
                                          {(
                                            (event[K.INPUT_CHARS] as number) + (event[K.OUTPUT_CHARS] as number)
                                          ).toLocaleString()}{' '}
                                          chars
                                        </div>
                                      </>
                                    )}

                                  {/* Token Usage */}
                                  {event[K.INPUT_TOKENS] !== undefined && (
                                    <>
                                      <div
                                        style={{
                                          color: 'var(--text-secondary)',
                                          marginTop: '0.5rem',
                                        }}
                                      >
                                        Input Tokens:
                                      </div>
                                      <div
                                        style={{
                                          fontFamily: 'monospace',
                                          marginTop: '0.5rem',
                                        }}
                                      >
                                        {(event[K.INPUT_TOKENS] as number).toLocaleString()}
                                      </div>
                                    </>
                                  )}

                                  {event[K.OUTPUT_TOKENS] !== undefined && (
                                    <>
                                      <div
                                        style={{
                                          color: 'var(--text-secondary)',
                                        }}
                                      >
                                        Output Tokens:
                                      </div>
                                      <div style={{ fontFamily: 'monospace' }}>
                                        {(event[K.OUTPUT_TOKENS] as number).toLocaleString()}
                                      </div>
                                    </>
                                  )}

                                  {event[K.INPUT_TOKENS] !== undefined && event[K.OUTPUT_TOKENS] !== undefined && (
                                    <>
                                      <div
                                        style={{
                                          color: 'var(--text-secondary)',
                                          fontWeight: 500,
                                        }}
                                      >
                                        Total Tokens:
                                      </div>
                                      <div
                                        style={{
                                          fontFamily: 'monospace',
                                          fontWeight: 500,
                                        }}
                                      >
                                        {((event[K.INPUT_TOKENS] as number || 0) + (event[K.OUTPUT_TOKENS] as number || 0)).toLocaleString()}
                                      </div>
                                    </>
                                  )}

                                  {/* Execution Stats */}
                                  {event[K.AGENT_STEPS] !== undefined && (
                                    <>
                                      <div
                                        style={{
                                          color: 'var(--text-secondary)',
                                          marginTop: '0.5rem',
                                        }}
                                      >
                                        Steps Taken:
                                      </div>
                                      <div
                                        style={{
                                          fontFamily: 'monospace',
                                          marginTop: '0.5rem',
                                        }}
                                      >
                                        {event[K.AGENT_STEPS] as number}
                                      </div>
                                    </>
                                  )}

                                  {event[K.AGENT_MAX_STEPS] !== undefined && (
                                    <>
                                      <div
                                        style={{
                                          color: 'var(--text-secondary)',
                                        }}
                                      >
                                        Max Steps:
                                      </div>
                                      <div style={{ fontFamily: 'monospace' }}>
                                        {event[K.AGENT_MAX_STEPS] as number}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </details>
                            ) : null}
                          </>
                        );
                      })()}
                  </div>
                );
              })
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
        </div>
      </div>

      <style>{`
        .monitoring-view {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-primary);
          color: var(--text-primary);
        }

        .monitoring-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-primary);
        }

        .monitoring-title {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .monitoring-title h1 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0;
        }

        .status-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.25rem 0.75rem;
          background: var(--bg-tertiary);
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--health-success);
          animation: statusPulse 2s ease-in-out infinite;
        }

        @keyframes statusPulse {
          0%, 100% { 
            opacity: 1;
            transform: scale(1);
          }
          50% { 
            opacity: 0.5;
            transform: scale(0.85);
          }
        }

        .monitoring-stats {
          display: flex;
          gap: 2rem;
        }

        .stat-item {
          display: flex;
          gap: 0.5rem;
          font-size: 0.875rem;
        }

        .stat-label {
          color: var(--text-secondary);
        }

        .stat-value {
          font-weight: 600;
          color: var(--text-primary);
        }

        .monitoring-actions {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .time-filter-wrapper {
          position: relative;
        }

        .time-filter-button {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          border-radius: 4px;
          color: var(--text-primary);
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .time-filter-button:hover {
          background: var(--bg-hover);
        }

        .time-controls-dropdown {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          z-index: 100;
          min-width: 250px;
        }

        .time-mode-tabs {
          display: flex;
          border-bottom: 1px solid var(--border-primary);
        }

        .time-mode-tabs button {
          flex: 1;
          padding: 0.75rem;
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .time-mode-tabs button.active {
          color: var(--accent-primary);
          border-bottom: 2px solid var(--accent-primary);
        }

        .relative-time-options {
          display: flex;
          flex-direction: column;
          padding: 0.5rem;
        }

        .relative-time-options button {
          padding: 0.75rem;
          background: none;
          border: none;
          color: var(--text-primary);
          font-size: 0.875rem;
          text-align: left;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .relative-time-options button .option-label {
          font-weight: 600;
        }

        .relative-time-options button .option-time {
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
        }

        .relative-time-options button:hover {
          background: var(--bg-tertiary);
        }

        .relative-time-options button.active {
          background: var(--accent-primary);
          color: white;
        }

        .absolute-time-inputs {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1rem;
        }

        .absolute-time-inputs label {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .absolute-time-inputs input {
          padding: 0.5rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          border-radius: 4px;
          color: var(--text-primary);
          font-size: 0.875rem;
        }

        .apply-button {
          padding: 0.5rem 1rem;
          background: var(--accent-primary);
          border: none;
          border-radius: 4px;
          color: white;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .apply-button:hover {
          opacity: 0.9;
        }

        .active-filters {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .filter-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.375rem 0.75rem;
          background: var(--accent-primary);
          color: white;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .filter-badge button {
          background: none;
          border: none;
          color: white;
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
          padding: 0;
          margin-left: 0.25rem;
        }

        .filter-badge button:hover {
          opacity: 0.8;
        }

        .monitoring-content {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .monitoring-sidebar {
          width: 280px;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-primary);
          display: flex;
          flex-direction: column;
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem;
          border-bottom: 1px solid var(--border-primary);
        }

        .sidebar-header h3 {
          font-size: 0.875rem;
          font-weight: 600;
          margin: 0;
        }

        .agent-count {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .agent-list {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem;
          user-select: none;
        }

        .agent-card {
          padding: 0.75rem;
          margin-bottom: 0.5rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          border-radius: 6px;
          border-left: 3px solid var(--border-primary);
          cursor: pointer;
          transition: all 0.2s;
        }

        .agent-card:hover {
          background: var(--bg-hover);
        }

        .agent-card.selected {
          border-left-color: var(--accent-primary);
          border-color: var(--accent-primary);
          background: var(--bg-hover);
          box-shadow: 0 0 0 1px var(--accent-primary);
        }

        .agent-card.status-idle {
          border-left-color: var(--text-tertiary);
        }

        .agent-card.status-active {
          border-left-color: var(--accent-primary);
        }

        .agent-card.status-running {
          border-left-color: var(--success);
          animation: pulseBackground 2s ease-in-out infinite;
        }

        @keyframes pulseBackground {
          0%, 100% {
            background: var(--bg-tertiary);
          }
          50% {
            background: color-mix(in srgb, var(--success) 15%, var(--bg-tertiary));
          }
        }

        .agent-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }

        .agent-name {
          font-weight: 500;
          font-size: 0.875rem;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .health-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
          flex-shrink: 0;
          animation: pulse 3s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(0.95);
          }
        }

        .health-dot.healthy {
          background: var(--health-success);
        }

        .health-dot.unhealthy {
          background: var(--health-error);
        }

        .health-dot.unknown {
          background: var(--health-warning);
        }

        .agent-status {
          font-size: 0.625rem;
          padding: 0.125rem 0.5rem;
          border-radius: 3px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .agent-status.idle {
          background: var(--bg-tertiary);
          color: var(--text-tertiary);
        }

        .agent-status.active {
          background: var(--bg-tertiary);
          color: var(--accent-primary);
        }

        .agent-status.running {
          background: var(--bg-tertiary);
          color: var(--success);
          animation: pulse 2s ease-in-out infinite;
        }

        .agent-meta {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .running-conversations {
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid var(--border-primary);
          animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            max-height: 0;
          }
          to {
            opacity: 1;
            max-height: 200px;
          }
        }

        .conversations-label {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          margin-bottom: 0.5rem;
          letter-spacing: 0.5px;
        }

        .conversation-item {
          display: flex;
          align-items: center;
          padding: 0.5rem;
          margin-bottom: 0.25rem;
          background: var(--bg-secondary);
          border-left: 3px solid var(--border-primary);
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .conversation-item:hover {
          background: var(--bg-hover);
          transform: translateX(2px);
        }

        .conversation-id {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          color: var(--text-primary);
        }

        .conversation-pill {
          font-size: 0.65rem;
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
          color: white;
          font-weight: 500;
        }

        .meta-item {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
        }

        .meta-label {
          color: var(--text-secondary);
        }

        .meta-value {
          color: var(--text-primary);
          font-weight: 500;
        }

        .monitoring-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .log-controls {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 1rem;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-primary);
        }

        .log-controls-row {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .event-filters {
          display: flex;
          gap: 0.5rem;
        }

        .event-filter {
          padding: 0.375rem 0.75rem;
          border: 1px solid var(--border-primary);
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .event-filter.active {
          color: white;
        }

        .event-filter[data-type="agent"].active {
          background: var(--event-agent-start);
          border-color: var(--event-agent-start);
        }

        .event-filter[data-type="tool"].active {
          background: var(--event-tool-call);
          border-color: var(--event-tool-call);
        }

        .event-filter[data-type="planning"].active {
          background: var(--event-planning);
          border-color: var(--event-planning);
        }

        .event-filter[data-type="reasoning"].active {
          background: var(--event-reasoning);
          border-color: var(--event-reasoning);
        }

        .event-filter[data-type="health"].active {
          background: var(--event-agent-health);
          border-color: var(--event-agent-health);
        }

        .search-wrapper {
          position: relative;
          flex: 1;
        }

        .search-input {
          width: 100%;
          padding: 0.5rem 1rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          border-radius: 4px;
          color: var(--text-primary);
          font-size: 0.875rem;
        }

        .search-input::placeholder {
          color: var(--text-secondary);
        }

        .search-clear {
          position: absolute;
          right: 0.5rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 1.5rem;
          line-height: 1;
          cursor: pointer;
          padding: 0.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .search-clear:hover {
          color: var(--text-primary);
        }

        .autocomplete-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 0.25rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          border-radius: 4px;
          max-height: 200px;
          overflow-y: auto;
          z-index: 1000;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .autocomplete-item {
          padding: 0.5rem 1rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          color: var(--text-primary);
        }

        .autocomplete-item:hover {
          background: var(--bg-secondary);
        }

        .autocomplete-item.selected {
          background: var(--accent-primary);
          color: white;
        }

        .autocomplete-item.selected .autocomplete-type {
          background: rgba(255, 255, 255, 0.3);
        }

        .autocomplete-item.empty {
          cursor: default;
          opacity: 0.7;
        }

        .autocomplete-item.empty:hover {
          background: var(--bg-tertiary);
        }

        .autocomplete-empty {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .autocomplete-hint {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .autocomplete-type {
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
          font-size: 0.75rem;
          font-weight: 600;
          color: white;
        }

        .autocomplete-item[data-type="agent"] .autocomplete-type {
          background: var(--event-agent-start);
        }

        .autocomplete-item[data-type="conversation"] .autocomplete-type {
          background: var(--event-agent-start);
        }

        .autocomplete-item[data-type="tool"] .autocomplete-type {
          background: var(--event-tool-call);
        }

        .active-filters-inline {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .filter-badge-inline {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-family: 'JetBrains Mono', monospace;
          color: var(--text-primary);
        }

        .filter-badge-inline button {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 1rem;
          line-height: 1;
          padding: 0;
          margin-left: 0.25rem;
        }

        .filter-badge-inline button:hover {
          color: var(--text-primary);
        }

        .btn-toggle {
          padding: 0.5rem 1rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          color: var(--text-secondary);
          border-radius: 4px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-toggle.active {
          background: var(--accent-primary);
          color: white;
          border-color: var(--accent-primary);
        }

        .live-mode-toggle {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.625rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          color: var(--text-secondary);
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .live-mode-toggle:hover {
          background: var(--bg-hover);
        }

        .live-mode-toggle.active {
          background: var(--health-success);
          color: white;
          border-color: var(--health-success);
        }

        .live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }

        .live-mode-toggle.active .live-dot {
          animation: livePulse 2s ease-in-out infinite;
        }

        @keyframes livePulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.4;
            transform: scale(0.8);
          }
        }

        .log-stream {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.875rem;
          position: relative;
        }

        .scroll-to-bottom {
          position: sticky;
          bottom: 1rem;
          right: 1rem;
          float: right;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--accent-primary);
          color: white;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          transition: all 0.2s;
          z-index: 10;
        }

        .scroll-to-bottom:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
        }

        .log-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-secondary);
        }

        .log-entry {
          display: flex;
          flex-direction: column;
          padding: 0.75rem;
          margin-bottom: 0.5rem;
          background: var(--bg-secondary);
          border-left: 4px solid var(--border-primary);
          border-radius: 4px;
          word-wrap: break-word;
          overflow-wrap: break-word;
          max-width: 100%;
        }

        .log-trace {
          display: flex;
          align-items: center;
        }

        .trace-pill {
          padding: 0.25rem 0.5rem;
          background: var(--color-primary);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 0.7rem;
          font-weight: 600;
          font-family: 'JetBrains Mono', monospace;
          cursor: pointer;
          transition: all 0.2s;
          opacity: 0.7;
          white-space: nowrap;
        }

        .trace-pill:hover {
          opacity: 1;
          transform: translateY(-1px);
        }

        .trace-pill.selected {
          opacity: 1;
          box-shadow: 0 0 0 2px var(--bg-primary), 0 0 0 4px var(--color-primary);
        }

        .log-row {
          display: grid;
          grid-template-columns: 120px 140px 180px 1fr;
          gap: 1rem;
          align-items: start;
        }

        .log-timestamp-col {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .log-timestamp {
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .trace-pill {
          padding: 0.125rem 0.375rem;
          background: transparent;
          color: var(--text-tertiary);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          font-size: 0.65rem;
          font-weight: 600;
          font-family: 'JetBrains Mono', monospace;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          align-self: flex-start;
        }

        .trace-pill:hover {
          border-color: var(--text-secondary);
          color: var(--text-secondary);
        }

        .trace-pill.selected {
          border-width: 1.5px;
          font-weight: 700;
        }

        .log-entry.new-event {
          animation: slideInFade 5s ease-out;
        }

        @keyframes slideInFade {
          0% {
            transform: translateX(-10px);
            opacity: 0;
          }
          5% {
            transform: translateX(0);
            opacity: 1;
          }
          100% {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .log-entry.event-tool-call,
        .log-entry.event-tool-result {
          border-left-color: var(--event-tool-call);
          background: color-mix(in srgb, var(--event-tool-call) 5%, var(--bg-secondary));
        }

        .log-entry.event-agent-start,
        .log-entry.event-agent-complete {
          border-left-color: var(--event-agent-start);
          background: color-mix(in srgb, var(--event-agent-start) 5%, var(--bg-secondary));
        }

        .log-entry.event-agent-health {
          border-left-color: var(--event-agent-health);
          background: color-mix(in srgb, var(--event-agent-health) 5%, var(--bg-secondary));
        }

        .log-entry.event-text-delta,
        .log-entry.event-planning {
          border-left-color: var(--event-planning);
          background: color-mix(in srgb, var(--event-planning) 5%, var(--bg-secondary));
        }

        .log-entry.event-reasoning {
          border-left-color: var(--event-reasoning);
          background: color-mix(in srgb, var(--event-reasoning) 5%, var(--bg-secondary));
        }

        .log-timestamp {
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .log-type {
          font-weight: 600;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          text-align: center;
          white-space: nowrap;
        }

        .event-agent-start .log-type,
        .event-agent-complete .log-type {
          background: var(--event-agent-start);
          color: white;
        }

        .event-tool-call .log-type,
        .event-tool-result .log-type {
          background: var(--event-tool-call);
          color: white;
        }

        .event-agent-health .log-type {
          background: var(--event-agent-health);
          color: white;
        }

        .event-text-delta .log-type,
        .event-planning .log-type {
          background: var(--event-planning);
          color: white;
        }

        .event-reasoning .log-type {
          background: var(--event-reasoning);
          color: white;
        }

        .log-agent {
          color: var(--accent-primary);
          font-weight: 500;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }

        .log-data {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 1rem;
          color: var(--text-secondary);
        }

        .log-inline {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .log-details {
          grid-column: 1 / -1;
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid var(--border-primary);
        }

        .log-details summary {
          cursor: pointer;
          font-size: 0.75rem;
          color: var(--accent-primary);
          user-select: none;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .export-btn {
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 4px;
          cursor: pointer;
          padding: 0.25rem;
          opacity: 0.6;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary);
          transition: opacity 0.2s;
        }

        .export-btn:hover {
          opacity: 1;
        }

        .artifacts-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-top: 0.5rem;
        }

        .artifact-item {
          padding: 0.75rem;
          background: var(--bg-tertiary);
          border-radius: 4px;
          border-left: 3px solid var(--accent-primary);
        }

        .artifact-header {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
          font-size: 0.75rem;
        }

        .artifact-type {
          padding: 0.125rem 0.5rem;
          background: var(--bg-primary);
          border-radius: 3px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .artifact-name {
          color: var(--warning);
          font-weight: 500;
        }

        .artifact-item pre {
          margin: 0;
          font-size: 0.75rem;
        }

        .log-details pre {
          margin-top: 0.5rem;
          padding: 0.5rem;
          background: var(--bg-tertiary);
          border-radius: 4px;
          font-size: 0.75rem;
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow-wrap: break-word;
          overflow-x: auto;
        }

        .tool-badge {
          background: var(--bg-tertiary);
          border-color: var(--warning);
          color: var(--warning);
        }

        .health-ok {
          background: var(--bg-tertiary);
          border-color: var(--success);
          color: var(--success);
        }

        .health-error {
          background: var(--bg-tertiary);
          border-color: var(--error);
          color: var(--error);
        }

        .meta-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .pill-button {
          padding: 0.125rem 0.5rem;
          background: var(--accent-primary);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .pill-button:hover {
          opacity: 0.8;
          transform: translateY(-1px);
        }

        .pill-button.selected {
          box-shadow: 0 0 0 2px var(--bg-primary), 0 0 0 4px currentColor;
        }

        .pill-badge {
          padding: 0.125rem 0.5rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .btn-secondary {
          padding: 0.5rem 1rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          color: var(--text-primary);
          border-radius: 4px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          background: var(--bg-hover);
        }

        @media (max-width: 768px) {
          .monitoring-content {
            flex-direction: column;
          }

          .monitoring-sidebar {
            width: 100%;
            border-right: none;
            border-bottom: 1px solid var(--border-primary);
            max-height: 40vh;
            overflow-y: auto;
          }

          .monitoring-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }

          .monitoring-stats {
            flex-wrap: wrap;
            gap: 0.5rem;
          }

          .monitoring-actions {
            flex-wrap: wrap;
            width: 100%;
          }

          .event-filters {
            flex-wrap: wrap;
            gap: 4px;
          }

          .event-filter {
            font-size: 11px;
            padding: 4px 8px;
          }

          .log-entry {
            padding: 8px 10px;
            font-size: 12px;
          }

          .log-entry .log-meta {
            flex-wrap: wrap;
            gap: 4px;
          }

          .time-controls-dropdown {
            min-width: unset;
            width: calc(100vw - 2rem);
            max-width: 300px;
          }
        }
      `}</style>
    </div>
  );
}
