import type { MonitoringEvent } from '../../contexts/MonitoringContext';
import { K } from '@shared/monitoring-keys';
import { getAgentColor, getEventType } from '../../views/monitoring-utils';

interface EventEntryProps {
  event: MonitoringEvent;
  isNew: boolean;
  selectedTraceId: string | null;
  selectedConversation: string | null;
  selectedToolCallId: string | null;
  onTraceClick: (traceId: string) => void;
  onConversationClick: (conversationId: string, agentSlug: string) => void;
  onToolCallClick: (toolCallId: string) => void;
  onCopyResult: (text: string) => void;
}

export function EventEntry({
  event,
  isNew,
  selectedTraceId,
  selectedConversation,
  selectedToolCallId,
  onTraceClick,
  onConversationClick,
  onToolCallClick,
  onCopyResult,
}: EventEntryProps) {
  const agentColor = event[K.AGENT_SLUG]
    ? getAgentColor(event[K.AGENT_SLUG] as string)
    : undefined;

  return (
    <div
      className={`log-entry event-${getEventType(event)} agent-${event[K.AGENT_SLUG]} ${isNew ? 'new-event' : ''}`}
      style={
        agentColor
          ? { background: `color-mix(in srgb, ${agentColor} 8%, var(--bg-secondary))` }
          : undefined
      }
    >
      <div className="log-row">
        <div className="log-timestamp-col">
          <div
            className="log-timestamp"
            title={
              event.timestamp
                ? new Date(event.timestamp).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'long' })
                : 'No timestamp'
            }
          >
            {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '-'}
            {!!event[K.TIMESTAMP_MS] && (
              <span className="timestamp-ms">
                .{String(event[K.TIMESTAMP_MS] % 1000).padStart(3, '0')}
              </span>
            )}
          </div>
          {!!event[K.TRACE_ID] && (
            <button
              className={`trace-pill ${selectedTraceId === event[K.TRACE_ID] ? 'selected' : ''}`}
              onClick={() => onTraceClick(event[K.TRACE_ID] as string)}
              title={`Trace ID: ${event[K.TRACE_ID]}\nClick to filter`}
              style={
                selectedTraceId === event[K.TRACE_ID] && agentColor
                  ? { borderColor: agentColor, color: agentColor }
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
                className={`pill-button pill-button-conversation ${selectedConversation === event[K.CONVERSATION_ID] ? 'selected' : ''}`}
                onClick={() =>
                  onConversationClick(event[K.CONVERSATION_ID] as string, event[K.AGENT_SLUG] as string)
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
                className={`pill-button pill-button-tool ${selectedToolCallId === event[K.TOOL_CALL_ID] ? 'selected' : ''}`}
                onClick={() => onToolCallClick(event[K.TOOL_CALL_ID] as string)}
                title="Filter by tool call ID"
              >
                ...{(event[K.TOOL_CALL_ID] as string).slice(-6)}
              </button>
            </span>
          )}

          {!!event[K.TOOL_NAME] && (
            <span className="log-inline">
              <span className="meta-label">Tool:</span>
              <span className="pill-badge tool-badge">{event[K.TOOL_NAME] as string}</span>
            </span>
          )}

          {event[K.HEALTHY] !== undefined && (
            <span className="log-inline">
              <span className="meta-label">Status:</span>
              <span className={`pill-badge ${event[K.HEALTHY] ? 'health-ok' : 'health-error'}`}>
                {event[K.HEALTHY] ? '✓ Healthy' : '⚠ Unhealthy'}
              </span>
            </span>
          )}

          <IntegrationBadges event={event} />

          {!!(event[K.FINISH_REASONS] as string[] | undefined)?.[0] && (
            <span className="log-inline">
              <span className="meta-label">Reason:</span>
              <span className="pill-badge">{(event[K.FINISH_REASONS] as string[])[0]}</span>
              {(event[K.FINISH_REASONS] as string[])[0] === 'tool-calls' &&
                !!event[K.AGENT_MAX_STEPS] && (
                  <span className="max-steps-note">
                    (Hit max steps limit: {event[K.AGENT_STEPS]}/{event[K.AGENT_MAX_STEPS]})
                  </span>
                )}
            </span>
          )}
        </div>
      </div>

      {/* Collapsible sections */}
      <ReasoningSection event={event} />
      <HealthChecksSection event={event} />
      <ToolInputSection event={event} />
      <ToolResultSection event={event} onCopy={onCopyResult} />
      <ArtifactsSection event={event} />
    </div>
  );
}

/* ── Sub-sections (private to this file) ── */

function IntegrationBadges({ event }: { event: MonitoringEvent }) {
  const integrations = event[K.HEALTH_INTEGRATIONS] as
    | Array<{ type: string; id: string; connected: boolean; metadata?: { transport: string; toolCount: number } }>
    | undefined;
  if (!integrations?.length) return null;
  return (
    <span className="log-inline">
      <span className="meta-label">Integrations:</span>
      {integrations.map((integration, idx) => (
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
  );
}

function ReasoningSection({ event }: { event: MonitoringEvent }) {
  if (!event[K.REASONING_TEXT]) return null;
  const text = event[K.REASONING_TEXT] as string;
  return (
    <details className="log-details">
      <summary>
        Output
        <span className="log-details-char-count">({text.length} chars)</span>
      </summary>
      <pre className="log-details-pre-scroll">{text}</pre>
    </details>
  );
}

function HealthChecksSection({ event }: { event: MonitoringEvent }) {
  const checks = event[K.HEALTH_CHECKS] as Record<string, boolean> | undefined;
  if (!checks) return null;
  const integrations = event[K.HEALTH_INTEGRATIONS] as
    | Array<{ type: string; id: string; connected: boolean; metadata?: { transport: string; toolCount: number } }>
    | undefined;

  return (
    <details className="log-details">
      <summary>Health Checks</summary>
      <div className="health-checks-list">
        {Object.entries(checks).map(([key, value]) => (
          <div key={key} className="health-check-item">
            <span className="health-check-label">{key}:</span>
            <span className={value ? 'health-check-value-pass' : 'health-check-value-fail'}>
              {value ? '✓' : '✗'}
            </span>
          </div>
        ))}
        {integrations && integrations.length > 0 && (
          <div className="health-integrations-section">
            <div className="health-integrations-label">Integrations:</div>
            {integrations.map((integration, idx) => (
              <div key={idx} className="health-integration-item">
                <div className="health-integration-name">
                  {integration.id} ({integration.type})
                  <span className={integration.connected ? 'health-integration-status-ok' : 'health-integration-status-err'}>
                    {integration.connected ? '✓ Connected' : '✗ Disconnected'}
                  </span>
                </div>
                {integration.metadata && (
                  <div className="health-integration-meta">
                    Transport: {integration.metadata.transport} | Tools: {integration.metadata.toolCount}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function ToolInputSection({ event }: { event: MonitoringEvent }) {
  const args = event[K.TOOL_CALL_ARGS];
  if (!args) return null;
  const hasContent =
    typeof args === 'string' ? (args as string).length > 0 : Object.keys(args as Record<string, unknown>).length > 0;
  if (!hasContent) return null;
  const argsStr = typeof args === 'string' ? (args as string) : JSON.stringify(args, null, 2);
  const argsLabel =
    typeof args === 'string'
      ? `${(args as string).length} chars`
      : `${Object.keys(args as Record<string, unknown>).length} params`;
  return (
    <details className="log-details">
      <summary>Input ({argsLabel})</summary>
      <pre>{argsStr}</pre>
    </details>
  );
}

function ToolResultSection({ event, onCopy }: { event: MonitoringEvent; onCopy: (text: string) => void }) {
  if (!event[K.TOOL_CALL_RESULT]) return null;
  return (
    <details className="log-details">
      <summary>
        Result
        <button
          className="export-btn"
          onClick={(e) => {
            e.stopPropagation();
            onCopy(JSON.stringify(event[K.TOOL_CALL_RESULT], null, 2));
          }}
          title="Copy to clipboard"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </summary>
      <pre>{JSON.stringify(event[K.TOOL_CALL_RESULT], null, 2)}</pre>
    </details>
  );
}

function ArtifactsSection({ event }: { event: MonitoringEvent }) {
  if (getEventType(event) !== 'agent-complete') return null;
  const artifacts = event[K.ARTIFACTS] as Array<{ type: string; name?: string; content?: unknown }> | undefined;
  if (!artifacts) return null;

  const textArtifacts = artifacts.filter((a) => a.type === 'text');
  const finalOutput = textArtifacts.length > 0 ? String(textArtifacts[textArtifacts.length - 1].content ?? '') : null;
  const toolCalls = artifacts.filter((a) => a.type === 'tool-call');

  return (
    <>
      {finalOutput && (
        <details className="log-details">
          <summary>
            Output
            {finalOutput.length > 200 && (
              <span className="log-details-char-count">({finalOutput.length} chars)</span>
            )}
          </summary>
          <pre className="log-details-pre-scroll">{finalOutput}</pre>
        </details>
      )}
      {toolCalls.length > 0 && (
        <details className="log-details">
          <summary>Tools Used ({toolCalls.length})</summary>
          <div className="tool-result-list">
            {toolCalls.map((tool, idx) => (
              <div key={idx} className="tool-result-item">
                <div className="tool-result-name">{tool.name}</div>
              </div>
            ))}
          </div>
        </details>
      )}
      <UsageStatsSection event={event} />
    </>
  );
}

function UsageStatsSection({ event }: { event: MonitoringEvent }) {
  if (event[K.INPUT_TOKENS] === undefined && event[K.INPUT_CHARS] === undefined) return null;
  return (
    <details className="log-details">
      <summary>Usage & Stats</summary>
      <div className="usage-stats-grid">
        {event[K.INPUT_CHARS] !== undefined && (
          <>
            <div className="usage-stat-label">Input:</div>
            <div className="usage-stat-value">{(event[K.INPUT_CHARS] as number).toLocaleString()} chars</div>
          </>
        )}
        {event[K.OUTPUT_CHARS] !== undefined && (
          <>
            <div className="usage-stat-label">Output:</div>
            <div className="usage-stat-value">{(event[K.OUTPUT_CHARS] as number).toLocaleString()} chars</div>
          </>
        )}
        {event[K.INPUT_CHARS] !== undefined && event[K.OUTPUT_CHARS] !== undefined && (
          <>
            <div className="usage-stat-label-bold">Total:</div>
            <div className="usage-stat-value-bold">
              {((event[K.INPUT_CHARS] as number) + (event[K.OUTPUT_CHARS] as number)).toLocaleString()} chars
            </div>
          </>
        )}
        {event[K.INPUT_TOKENS] !== undefined && (
          <>
            <div className="usage-stat-label usage-stat-spaced">Input Tokens:</div>
            <div className="usage-stat-value usage-stat-spaced">{(event[K.INPUT_TOKENS] as number).toLocaleString()}</div>
          </>
        )}
        {event[K.OUTPUT_TOKENS] !== undefined && (
          <>
            <div className="usage-stat-label">Output Tokens:</div>
            <div className="usage-stat-value">{(event[K.OUTPUT_TOKENS] as number).toLocaleString()}</div>
          </>
        )}
        {event[K.INPUT_TOKENS] !== undefined && event[K.OUTPUT_TOKENS] !== undefined && (
          <>
            <div className="usage-stat-label-bold">Total Tokens:</div>
            <div className="usage-stat-value-bold">
              {((event[K.INPUT_TOKENS] as number || 0) + (event[K.OUTPUT_TOKENS] as number || 0)).toLocaleString()}
            </div>
          </>
        )}
        {event[K.AGENT_STEPS] !== undefined && (
          <>
            <div className="usage-stat-label usage-stat-spaced">Steps Taken:</div>
            <div className="usage-stat-value usage-stat-spaced">{event[K.AGENT_STEPS] as number}</div>
          </>
        )}
        {event[K.AGENT_MAX_STEPS] !== undefined && (
          <>
            <div className="usage-stat-label">Max Steps:</div>
            <div className="usage-stat-value">{event[K.AGENT_MAX_STEPS] as number}</div>
          </>
        )}
      </div>
    </details>
  );
}
