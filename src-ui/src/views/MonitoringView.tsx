import { useState, useEffect, useRef, useMemo } from 'react';
import { useMonitoring } from '../contexts/MonitoringContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useToast } from '../contexts/ToastContext';
import { useSearchAutocomplete, parseSearchQuery } from '../hooks/useSearchAutocomplete';
import type { AgentStats, MonitoringEvent } from '../contexts/MonitoringContext';

export function MonitoringView() {
  const { stats, events, clearEvents } = useMonitoring();
  const { setConversation, setActiveChat } = useNavigation();
  const { showToast } = useToast();
  const [autoFollow, setAutoFollow] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Search autocomplete
  const searchFilters = useMemo(() => [
    {
      key: 'agent',
      type: 'agent' as const,
      getOptions: () => (stats?.agents || []).map(a => a.slug)
    },
    {
      key: 'conversation',
      type: 'conversation' as const,
      getOptions: () => [...new Set(events.map(e => e.conversationId).filter(Boolean))] as string[]
    },
    {
      key: 'tool',
      type: 'tool' as const,
      getOptions: () => [...new Set(events.map(e => e.toolCallId).filter(Boolean))] as string[]
    },
    {
      key: 'trace',
      type: 'trace' as const,
      getOptions: () => [...new Set(events.map(e => (e as any).traceId).filter(Boolean))] as string[]
    }
  ], [stats, events]);
  
  const { showAutocomplete, autocompleteOptions, selectedIndex, handleSelect, handleKeyDown } = useSearchAutocomplete(searchQuery, searchFilters);
  
  // Event type groups
  const eventTypeGroups = {
    'Agent': ['agent-start', 'agent-complete'],
    'Tool': ['tool-call', 'tool-result'],
    'Reasoning': ['reasoning'],
    'Thinking': ['thinking'],
    'Health': ['agent-health']
  };
  
  const [eventTypeFilter, setEventTypeFilter] = useState<string[]>(
    Object.values(eventTypeGroups).flat()
  );
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'now' | 'today' | 'week' | 'month' | 'all'>('now');
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set());
  const [showScrollButton, setShowScrollButton] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logStreamRef = useRef<HTMLDivElement>(null);
  const prevEventCountRef = useRef(events.length);

  // Track new events for animation
  useEffect(() => {
    if (events.length > prevEventCountRef.current) {
      const newIds = new Set(newEventIds);
      // Add IDs of new events (use timestamp + type as ID)
      for (let i = prevEventCountRef.current; i < events.length; i++) {
        const event = events[i];
        newIds.add(`${event.timestamp}-${event.type}`);
      }
      setNewEventIds(newIds);
      
      // Remove animation class after 5 seconds
      setTimeout(() => {
        setNewEventIds(new Set());
      }, 5000);
    }
    prevEventCountRef.current = events.length;
  }, [events]);

  // Detect if user is at bottom
  useEffect(() => {
    const logStream = logStreamRef.current;
    if (!logStream) return;

    const handleScroll = () => {
      const isAtBottom = logStream.scrollHeight - logStream.scrollTop - logStream.clientHeight < 50;
      setShowScrollButton(!autoFollow && !isAtBottom);
    };

    logStream.addEventListener('scroll', handleScroll);
    return () => logStream.removeEventListener('scroll', handleScroll);
  }, [autoFollow]);

  const scrollToBottom = () => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleConversationClick = (conversationId: string, agentSlug: string) => {
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
      setSelectedAgents(prev => 
        prev.includes(agentSlug) 
          ? prev.filter(a => a !== agentSlug)
          : [...prev, agentSlug]
      );
    } else {
      // Single select
      setSelectedAgents(prev => 
        prev.length === 1 && prev[0] === agentSlug ? [] : [agentSlug]
      );
    }
  };

  // Generate consistent color for agent
  const getAgentColor = (agentSlug: string) => {
    // Avoid filter colors: blue (#3b82f6), orange (#f59e0b), cyan (#06b6d4), purple (#8b5cf6)
    const colors = ['#ef4444', '#22c55e', '#a855f7', '#f97316', '#14b8a6', '#ec4899'];
    const hash = agentSlug.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Generate consistent color for conversation ID
  const getConversationColor = (conversationId: string) => {
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
    const hash = conversationId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  useEffect(() => {
    if (autoFollow && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, autoFollow]);

  const handleAutocompleteSelect = (option: typeof autocompleteOptions[0]) => {
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
    const parsed = parseSearchQuery(query, ['agent', 'conversation', 'tool']);
    if (parsed.filters.agent) {
      setSelectedAgents(parsed.filters.agent);
    }
    if (parsed.filters.conversation?.[0]) {
      setSelectedConversation(parsed.filters.conversation[0]);
    }
    if (parsed.filters.tool?.[0]) {
      setSelectedToolCallId(parsed.filters.tool[0]);
    }
    // Clear filter text from input, keep only the text search
    if (parsed.text !== query) {
      setSearchQuery(parsed.text);
    }
  };

  const filteredEvents = events.filter(event => {
    const parsed = parseSearchQuery(searchQuery, ['agent', 'conversation', 'tool']);
    // Check both parsed query agents and selectedAgents from sidebar clicks
    const agentsToFilter = parsed.filters.agent || selectedAgents;
    if (agentsToFilter.length > 0 && !agentsToFilter.includes(event.agentSlug || '')) return false;
    // Check both parsed conversation and selectedConversation from sidebar clicks
    const conversationToFilter = parsed.filters.conversation?.[0] || selectedConversation;
    if (conversationToFilter && event.conversationId !== conversationToFilter) return false;
    // Check tool call ID filter
    const toolCallIdToFilter = parsed.filters.tool?.[0] || selectedToolCallId;
    if (toolCallIdToFilter && event.toolCallId !== toolCallIdToFilter) return false;
    // Check trace ID filter
    if (selectedTraceId && (event as any).traceId !== selectedTraceId) return false;
    if (eventTypeFilter.length > 0 && !eventTypeFilter.includes(event.type)) return false;
    if (parsed.text && !JSON.stringify(event).toLowerCase().includes(parsed.text.toLowerCase())) return false;
    return true;
  }).reverse(); // Newest at bottom

  const toggleEventType = (group: string) => {
    const groupTypes = eventTypeGroups[group as keyof typeof eventTypeGroups];
    const allSelected = groupTypes.every(type => eventTypeFilter.includes(type));
    
    if (allSelected) {
      // Remove all types in this group
      setEventTypeFilter(prev => prev.filter(t => !groupTypes.includes(t)));
    } else {
      // Add all types in this group
      setEventTypeFilter(prev => [...new Set([...prev, ...groupTypes])]);
    }
  };

  return (
    <div className="monitoring-view">
      {/* Header Stats */}
      <div className="monitoring-header">
        <div className="monitoring-title">
          <h1>MULTI-AGENT MONITORING</h1>
          <div className="status-badge">
            <span className="status-dot"></span>
            Connected
          </div>
        </div>
        
        <div className="monitoring-stats">
          <div className="stat-item">
            <span className="stat-label">Active:</span>
            <span className="stat-value">{stats?.summary.activeAgents || 0}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Running:</span>
            <span className="stat-value">{stats?.summary.runningAgents || 0}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Messages:</span>
            <span className="stat-value">{stats?.summary.totalMessages || 0}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Cost:</span>
            <span className="stat-value">${stats?.summary.totalCost.toFixed(2) || '0.00'}</span>
          </div>
        </div>

        <div className="monitoring-actions">
          <select 
            value={dateRange} 
            onChange={(e) => setDateRange(e.target.value as any)}
            className="date-range-select"
          >
            <option value="now">Now (Live)</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>
          <button onClick={clearEvents} className="btn-secondary">CLEAR ALL</button>
        </div>
      </div>

      <div className="monitoring-content">
        {/* Left Sidebar - Agents */}
        <div className="monitoring-sidebar">
          <div className="sidebar-header">
            <h3>AGENTS</h3>
            <span className="agent-count">{stats?.agents.length || 0} Total</span>
          </div>
          
          <div className="agent-list">
            {stats?.agents.map(agent => (
              <div 
                key={agent.slug} 
                className={`agent-card status-${agent.status} ${selectedAgents.includes(agent.slug) ? 'selected' : ''}`}
                onClick={(e) => handleAgentClick(agent.slug, e)}
                style={{ 
                  borderLeftColor: getAgentColor(agent.slug),
                  background: selectedAgents.includes(agent.slug) 
                    ? `color-mix(in srgb, ${getAgentColor(agent.slug)} 10%, var(--bg-secondary))`
                    : undefined
                }}
              >
                <div className="agent-header">
                  <span className="agent-name">
                    <span 
                      className={`health-dot ${agent.healthy === false ? 'unhealthy' : agent.healthy === true ? 'healthy' : 'unknown'}`}
                      title={agent.healthy === false ? 'Unhealthy' : agent.healthy === true ? 'Healthy' : 'Status unknown'}
                    ></span>
                    {agent.name}
                  </span>
                  <span className={`agent-status ${agent.status}`}>{agent.status.toUpperCase()}</span>
                </div>
                {agent.status === 'running' && (
                  <div className="active-conversations">
                    {events
                      .filter(e => e.agentSlug === agent.slug && e.type === 'agent-start' && e.conversationId)
                      .slice(0, 3)
                      .map((e, idx) => (
                        <div 
                          key={idx} 
                          className="conversation-pill"
                          style={{ background: getConversationColor(e.conversationId!) }}
                          title={e.conversationId}
                        >
                          {e.conversationId!.split(':').pop()?.substring(0, 6)}...
                        </div>
                      ))
                    }
                  </div>
                )}
                <div className="agent-meta">
                  <div className="meta-item">
                    <span className="meta-label">Model:</span>
                    <span className="meta-value">{typeof agent.model === 'string' ? agent.model.split('.')[1]?.toUpperCase() || agent.model : 'N/A'}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Messages:</span>
                    <span className="meta-value">{agent.messageCount}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Cost:</span>
                    <span className="meta-value">${agent.cost.toFixed(3)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center - Log Stream */}
        <div className="monitoring-main">
          <div className="log-controls">
            <div className="log-controls-row">
              <div className="event-filters">
                {Object.keys(eventTypeGroups).map(group => {
                  const groupTypes = eventTypeGroups[group as keyof typeof eventTypeGroups];
                  const allSelected = groupTypes.every(type => eventTypeFilter.includes(type));
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
                        onClick={() => !option.isEmpty && handleAutocompleteSelect(option)}
                      >
                        {option.isEmpty ? (
                          <div className="autocomplete-empty">
                            <div>{option.label}</div>
                            {option.emptyMessage && <div className="autocomplete-hint">{option.emptyMessage}</div>}
                          </div>
                        ) : (
                          <>
                            <span className="autocomplete-type">{option.type}</span>
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
            
            {(selectedAgents.length > 0 || selectedConversation || selectedToolCallId || selectedTraceId) && (
              <div className="active-filters-inline">
                {selectedAgents.map(agent => (
                  <span 
                    key={agent} 
                    className="filter-badge-inline" 
                    style={{ 
                      borderLeft: `3px solid ${getAgentColor(agent)}`,
                      background: `color-mix(in srgb, ${getAgentColor(agent)} 15%, var(--bg-tertiary))`
                    }}
                  >
                    agent:{agent}
                    <button onClick={() => setSelectedAgents(prev => prev.filter(a => a !== agent))}>×</button>
                  </span>
                ))}
                {selectedConversation && (
                  <span 
                    className="filter-badge-inline"
                    style={{ 
                      borderLeft: `3px solid var(--event-agent-start)`,
                      background: `color-mix(in srgb, var(--event-agent-start) 15%, var(--bg-tertiary))`
                    }}
                  >
                    conversation:{selectedConversation.split(':').pop()?.substring(0, 8)}
                    <button onClick={() => setSelectedConversation(null)}>×</button>
                  </span>
                )}
                {selectedToolCallId && (
                  <span 
                    className="filter-badge-inline"
                    style={{ 
                      borderLeft: `3px solid var(--event-tool-call)`,
                      background: `color-mix(in srgb, var(--event-tool-call) 15%, var(--bg-tertiary))`
                    }}
                  >
                    tool:{selectedToolCallId}
                    <button onClick={() => setSelectedToolCallId(null)}>×</button>
                  </span>
                )}
                {selectedTraceId && (
                  <span 
                    className="filter-badge-inline"
                    style={{ 
                      borderLeft: `3px solid var(--color-primary)`,
                      background: `color-mix(in srgb, var(--color-primary) 15%, var(--bg-tertiary))`
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
                const eventId = `${event.timestamp}-${event.type}`;
                const isNew = newEventIds.has(eventId);
                const agentColor = event.agentSlug ? getAgentColor(event.agentSlug) : undefined;
                return (
                <div 
                  key={idx} 
                  className={`log-entry event-${event.type} agent-${event.agentSlug} ${isNew ? 'new-event' : ''}`}
                  style={agentColor ? {
                    background: `color-mix(in srgb, ${agentColor} 8%, var(--bg-secondary))`
                  } : undefined}
                >
                  <div 
                    className="log-timestamp" 
                    title={new Date(event.timestamp).toLocaleString('en-US', { 
                      dateStyle: 'full', 
                      timeStyle: 'long' 
                    })}
                  >
                    {new Date(event.timestamp).toLocaleTimeString()}
                    {(event as any).timestampMs && (
                      <span style={{ fontSize: '0.7em', opacity: 0.6, marginLeft: '0.25rem' }}>
                        .{String((event as any).timestampMs % 1000).padStart(3, '0')}
                      </span>
                    )}
                  </div>
                  <div className="log-type">{event.type.toUpperCase()}</div>
                  {event.agentSlug && <div className="log-agent">{event.agentSlug}</div>}
                  
                  <div className="log-data">
                    {event.conversationId && (
                      <span className="log-inline">
                        <span className="meta-label">Conversation:</span>
                        <button 
                          className={`pill-button ${selectedConversation === event.conversationId ? 'selected' : ''}`}
                          style={{ 
                            backgroundColor: 'var(--event-agent-start)',
                            borderColor: 'var(--event-agent-start)'
                          }}
                          onClick={() => handleConversationClick(event.conversationId!, event.agentSlug!)}
                          title="Filter by conversation"
                        >
                          ...{event.conversationId.slice(-6)}
                        </button>
                      </span>
                    )}
                    
                    {event.toolCallId && (
                      <span className="log-inline">
                        <span className="meta-label">Tool Call:</span>
                        <button
                          className={`pill-button ${selectedToolCallId === event.toolCallId ? 'selected' : ''}`}
                          onClick={() => handleToolCallClick(event.toolCallId!)}
                          title="Filter by tool call ID"
                          style={{ 
                            background: 'var(--event-tool-call)',
                            borderColor: 'var(--event-tool-call)',
                            color: 'white'
                          }}
                        >
                          ...{event.toolCallId.slice(-6)}
                        </button>
                      </span>
                    )}
                    
                    {(event as any).traceId && (
                      <span className="log-inline">
                        <span className="meta-label">Trace:</span>
                        <button
                          className={`pill-button ${selectedTraceId === (event as any).traceId ? 'selected' : ''}`}
                          onClick={() => handleTraceClick((event as any).traceId)}
                          title="Filter by trace ID"
                          style={{ 
                            background: 'var(--color-primary)',
                            borderColor: 'var(--color-primary)',
                            color: 'white',
                            fontSize: '0.75rem'
                          }}
                        >
                          ...{(event as any).traceId.slice(-8)}
                        </button>
                      </span>
                    )}
                    
                    {event.toolName && (
                      <span className="log-inline">
                        <span className="meta-label">Tool:</span>
                        <span className="pill-badge tool-badge">{event.toolName}</span>
                        {(event as any).requiresApproval && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--warning-primary)' }}>
                            🔒 Requires Approval
                          </span>
                        )}
                        {(event as any).toolCallNumber !== undefined && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            Call #{(event as any).toolCallNumber}
                          </span>
                        )}
                      </span>
                    )}
                    
                    {event.healthy !== undefined && (
                      <span className="log-inline">
                        <span className="meta-label">Status:</span>
                        <span className={`pill-badge ${event.healthy ? 'health-ok' : 'health-error'}`}>
                          {event.healthy ? '✓ Healthy' : '⚠ Unhealthy'}
                        </span>
                      </span>
                    )}
                    
                    {event.integrations && event.integrations.length > 0 && (
                      <span className="log-inline">
                        <span className="meta-label">Integrations:</span>
                        {event.integrations.map((integration, idx) => (
                          <span 
                            key={idx}
                            className={`pill-badge ${integration.connected ? 'health-ok' : 'health-error'}`}
                            title={`${integration.type.toUpperCase()} - ${integration.connected ? 'Connected' : 'Disconnected'}${integration.metadata ? `\nTransport: ${integration.metadata.transport}\nTools: ${integration.metadata.toolCount}` : ''}`}
                          >
                            {integration.id}
                            {integration.metadata && ` (${integration.metadata.toolCount} tools)`}
                          </span>
                        ))}
                      </span>
                    )}
                    
                    {(event as any).reason && (
                      <span className="log-inline">
                        <span className="meta-label">Reason:</span>
                        <span className="pill-badge">{(event as any).reason}</span>
                        {(event as any).reason === 'tool-calls' && (event as any).maxSteps && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            (Hit max steps limit: {(event as any).steps}/{(event as any).maxSteps})
                          </span>
                        )}
                      </span>
                    )}
                    
                    {(event as any).data && (
                      <details className="log-details" style={{ marginTop: '0.75rem' }}>
                        <summary>
                          Output
                          <span style={{ fontSize: '0.75rem', marginLeft: '0.5rem', color: 'var(--text-secondary)' }}>
                            ({(event as any).data.length} chars)
                          </span>
                        </summary>
                        <pre style={{ whiteSpace: 'pre-wrap', maxHeight: '400px', overflow: 'auto' }}>
                          {(event as any).data}
                        </pre>
                      </details>
                    )}
                    
                    {event.checks && (
                      <details className="log-details">
                        <summary>Health Checks</summary>
                        <div style={{ padding: '0.5rem 0' }}>
                          {Object.entries(event.checks).map(([key, value]) => (
                            <div key={key} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>{key}:</span>
                              <span style={{ color: value ? 'var(--success)' : 'var(--error)' }}>
                                {value ? '✓' : '✗'}
                              </span>
                            </div>
                          ))}
                          {event.integrations && event.integrations.length > 0 && (
                            <div style={{ marginTop: '1rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-primary)' }}>
                              <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Integrations:</div>
                              {event.integrations.map((integration, idx) => (
                                <div key={idx} style={{ marginLeft: '1rem', marginBottom: '0.5rem' }}>
                                  <div style={{ fontWeight: 500 }}>
                                    {integration.id} ({integration.type})
                                    <span style={{ color: integration.connected ? 'var(--success)' : 'var(--error)', marginLeft: '0.5rem' }}>
                                      {integration.connected ? '✓ Connected' : '✗ Disconnected'}
                                    </span>
                                  </div>
                                  {integration.metadata && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                      Transport: {integration.metadata.transport} | Tools: {integration.metadata.toolCount}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                    
                    {event.input && Object.keys(event.input).length > 0 && (
                      <details className="log-details">
                        <summary>Input ({Object.keys(event.input).length} params)</summary>
                        <pre>{JSON.stringify(event.input, null, 2)}</pre>
                      </details>
                    )}
                    
                    {event.result && (
                      <details className="log-details">
                        <summary>
                          Result
                          <button 
                            className="export-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(JSON.stringify(event.result, null, 2));
                              showToast('Copied to clipboard');
                            }}
                            title="Copy to clipboard"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                          </button>
                        </summary>
                        <pre>{JSON.stringify(event.result, null, 2)}</pre>
                      </details>
                    )}
                    
                    {event.type === 'agent-complete' && event.artifacts && (() => {
                      const textArtifacts = event.artifacts.filter(a => a.type === 'text');
                      const finalOutput = textArtifacts.length > 0 ? textArtifacts[textArtifacts.length - 1].content : null;
                      const toolCalls = event.artifacts.filter(a => a.type === 'tool-call');
                      
                      return (
                        <>
                          {finalOutput && (() => {
                            const preview = finalOutput.length > 200 ? finalOutput.substring(0, 200) + '...' : finalOutput;
                            const needsExpansion = finalOutput.length > 200;
                            
                            return (
                              <details className="log-details">
                                <summary>
                                  Output
                                  {needsExpansion && <span style={{ fontSize: '0.75rem', marginLeft: '0.5rem', color: 'var(--text-secondary)' }}>({finalOutput.length} chars)</span>}
                                </summary>
                                <pre style={{ whiteSpace: 'pre-wrap', maxHeight: '400px', overflow: 'auto' }}>{finalOutput}</pre>
                              </details>
                            );
                          })()}
                          {toolCalls.length > 0 && (
                            <details className="log-details">
                              <summary>Tools Used ({toolCalls.length})</summary>
                              <div style={{ padding: '0.5rem 0' }}>
                                {toolCalls.map((tool, idx) => (
                                  <div key={idx} style={{ marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: idx < toolCalls.length - 1 ? '1px solid var(--border-primary)' : 'none' }}>
                                    <div style={{ fontWeight: 500, color: 'var(--event-tool-call)' }}>{tool.name}</div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                          {(event as any).usage && (
                            <details className="log-details">
                              <summary>Usage & Stats</summary>
                              <div style={{ padding: '0.5rem 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem', fontSize: '0.9em' }}>
                                {/* Character Counts */}
                                {(event as any).inputChars !== undefined && (
                                  <>
                                    <div style={{ color: 'var(--text-secondary)' }}>Input:</div>
                                    <div style={{ fontFamily: 'monospace' }}>{(event as any).inputChars.toLocaleString()} chars</div>
                                  </>
                                )}
                                
                                {(event as any).outputChars !== undefined && (
                                  <>
                                    <div style={{ color: 'var(--text-secondary)' }}>Output:</div>
                                    <div style={{ fontFamily: 'monospace' }}>{(event as any).outputChars.toLocaleString()} chars</div>
                                  </>
                                )}
                                
                                {(event as any).inputChars !== undefined && (event as any).outputChars !== undefined && (
                                  <>
                                    <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Total:</div>
                                    <div style={{ fontFamily: 'monospace', fontWeight: 500 }}>{((event as any).inputChars + (event as any).outputChars).toLocaleString()} chars</div>
                                  </>
                                )}
                                
                                {/* Token Usage */}
                                {(event as any).usage?.promptTokens !== undefined && (
                                  <>
                                    <div style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Prompt Tokens:</div>
                                    <div style={{ fontFamily: 'monospace', marginTop: '0.5rem' }}>{(event as any).usage.promptTokens.toLocaleString()}</div>
                                  </>
                                )}
                                
                                {(event as any).usage?.completionTokens !== undefined && (
                                  <>
                                    <div style={{ color: 'var(--text-secondary)' }}>Completion Tokens:</div>
                                    <div style={{ fontFamily: 'monospace' }}>{(event as any).usage.completionTokens.toLocaleString()}</div>
                                  </>
                                )}
                                
                                {(event as any).usage?.totalTokens !== undefined && (
                                  <>
                                    <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Total Tokens:</div>
                                    <div style={{ fontFamily: 'monospace', fontWeight: 500 }}>{(event as any).usage.totalTokens.toLocaleString()}</div>
                                  </>
                                )}
                                
                                {/* Execution Stats */}
                                {(event as any).steps !== undefined && (
                                  <>
                                    <div style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Steps Taken:</div>
                                    <div style={{ fontFamily: 'monospace', marginTop: '0.5rem' }}>{(event as any).steps}</div>
                                  </>
                                )}
                                
                                {(event as any).maxSteps !== undefined && (
                                  <>
                                    <div style={{ color: 'var(--text-secondary)' }}>Max Steps:</div>
                                    <div style={{ fontFamily: 'monospace' }}>{(event as any).maxSteps}</div>
                                  </>
                                )}
                                
                                {(event as any).toolCallCount !== undefined && (
                                  <>
                                    <div style={{ color: 'var(--text-secondary)' }}>Tool Calls:</div>
                                    <div style={{ fontFamily: 'monospace' }}>{(event as any).toolCallCount}</div>
                                  </>
                                )}
                              </div>
                            </details>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
              })
            )}
            <div ref={logEndRef} />
            {showScrollButton && (
              <button className="scroll-to-bottom" onClick={scrollToBottom} title="Scroll to bottom">
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
          background: var(--success);
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
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

        .date-range-select {
          padding: 0.5rem 1rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          border-radius: 4px;
          color: var(--text-primary);
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
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

        .active-conversations {
          display: flex;
          gap: 0.25rem;
          flex-wrap: wrap;
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px solid var(--border-primary);
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

        .event-filter[data-type="thinking"].active {
          background: var(--event-thinking);
          border-color: var(--event-thinking);
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
          font-family: 'Monaco', 'Menlo', monospace;
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

        .log-stream {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          font-family: 'Monaco', 'Menlo', monospace;
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
          gap: 1rem;
          padding: 0.75rem;
          margin-bottom: 0.5rem;
          background: var(--bg-secondary);
          border-left: 4px solid var(--border-primary);
          border-radius: 4px;
          word-wrap: break-word;
          overflow-wrap: break-word;
          max-width: 100%;
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
        .log-entry.event-thinking {
          border-left-color: var(--event-thinking);
          background: color-mix(in srgb, var(--event-thinking) 5%, var(--bg-secondary));
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
          min-width: 120px;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          align-self: flex-start;
          text-align: center;
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
        .event-thinking .log-type {
          background: var(--event-thinking);
          color: white;
        }

        .event-reasoning .log-type {
          background: var(--event-reasoning);
          color: white;
        }

        .log-agent {
          color: var(--accent-primary);
          font-weight: 500;
        }

        .log-data {
          flex: 1;
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
          width: 100%;
          margin-top: 0.5rem;
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
      `}</style>
    </div>
  );
}
