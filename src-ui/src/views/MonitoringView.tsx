import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { useModels } from '../contexts/ModelsContext';
import { useMonitoring } from '../contexts/MonitoringContext';
import { useToast } from '../contexts/ToastContext';
import {
  parseSearchQuery,
  useSearchAutocomplete,
} from '../hooks/useSearchAutocomplete';
import { K } from '@shared/monitoring-keys';
import { EventEntry } from '../components/monitoring/EventEntry';
import { MetricsPanel } from '../components/monitoring/MetricsPanel';
import {
  EVENT_TYPE_GROUPS,
  RELATIVE_TIME_OPTIONS,
  getAgentColor,
  getConversationColor,
  getEventType,
  getRelativeMs,
  type RelativeTimeValue,
} from './monitoring-utils';
import './MonitoringView.css';

export function MonitoringView() {
  const { stats, events, clearEvents, setTimeRange, connectionStatus, isLoading } = useMonitoring();
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
  const [timeMode, setTimeMode] = useState<'relative' | 'absolute'>('absolute');
  const [relativeTime, setRelativeTime] = useState<RelativeTimeValue>('5m');
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
      const ms = getRelativeMs(relativeTime);
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

  // Parse URL filter params on mount (deep link from chat MessageBubble)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const filtersParam = params.get('filters');
      if (!filtersParam) return;
      const filters = JSON.parse(filtersParam);
      if (filters.trace) setSelectedTraceId(filters.trace[0] ?? null);
      if (filters.agent) setSelectedAgents(filters.agent);
      if (filters.conversation) setSelectedConversation(filters.conversation[0] ?? null);
      if (filters.tool) setSelectedToolCallId(filters.tool[0] ?? null);
    } catch { /* ignore malformed params */ }
  }, []);

  // Update time range when live mode changes
  useEffect(() => {
    if (timeMode === 'relative') {
      const ms = getRelativeMs(relativeTime);
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
    const groupTypes = EVENT_TYPE_GROUPS[group as keyof typeof EVENT_TYPE_GROUPS] as readonly string[];
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
            <span className={`status-dot status-dot-${connectionStatus}`}></span>
            {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting...' : connectionStatus === 'error' ? 'Error' : 'Disconnected'}
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
                className="time-filter-content"
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
                        className="time-range-sublabel"
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
                    const ms = getRelativeMs(relativeTime);
                    const start = new Date(Date.now() - ms);
                    return (
                      <span
                        className="time-range-sublabel"
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
                        className="time-range-sublabel"
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
                    {RELATIVE_TIME_OPTIONS.map((option) => {
                      const now = new Date();
                      const start = new Date(now.getTime() - option.ms);
                      return (
                        <button
                          key={option.value}
                          className={
                            relativeTime === option.value ? 'active' : ''
                          }
                          onClick={() => {
                            setRelativeTime(option.value);
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
                      <div className="time-end-row">
                        <input
                          type="datetime-local"
                          value={absoluteEnd}
                          onChange={(e) => {
                            setAbsoluteEnd(e.target.value);
                            if (isLiveMode) setIsLiveMode(false);
                          }}
                          disabled={isLiveMode}
                          placeholder="Leave empty for now"
                          className={isLiveMode ? 'time-end-input-disabled' : ''}
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
                          className="time-now-button"
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
                    {/* TODO: Wire up real cost from usage-aggregator (see utils/pricing.ts) */}
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
                  <div className="agent-historical-header">
                    Historical
                  </div>
                  {historicalSlugs.map((slug) => {
                    const eventCount = filteredEvents.filter(
                      (e) => e[K.AGENT_SLUG] === slug,
                    ).length;
                    return (
                      <div
                        key={slug}
                        className={`agent-card historical ${selectedAgents.includes(slug) ? 'selected' : ''}`}
                        onClick={(e) => handleAgentClick(slug, e)}
                        style={{
                          borderLeftColor: getAgentColor(slug),
                          background: selectedAgents.includes(slug)
                            ? `color-mix(in srgb, ${getAgentColor(slug)} 10%, var(--bg-secondary))`
                            : undefined,
                        }}
                      >
                        <div className="agent-header">
                          <span className="agent-name">{slug}</span>
                          <span
                            className="agent-status historical-status"
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
                {Object.keys(EVENT_TYPE_GROUPS).map((group) => {
                  const groupTypes =
                    EVENT_TYPE_GROUPS[group as keyof typeof EVENT_TYPE_GROUPS];
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
                  onTraceClick={handleTraceClick}
                  onConversationClick={handleConversationClick}
                  onToolCallClick={handleToolCallClick}
                  onCopyResult={(text) => { navigator.clipboard.writeText(text); showToast('Copied to clipboard'); }}
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

class MonitoringErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('MonitoringView error:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="monitoring-view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <p>Something went wrong in the monitoring view.</p>
            <button className="btn-secondary" onClick={() => this.setState({ hasError: false })}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function MonitoringViewWithBoundary() {
  return (
    <MonitoringErrorBoundary>
      <MonitoringView />
    </MonitoringErrorBoundary>
  );
}
