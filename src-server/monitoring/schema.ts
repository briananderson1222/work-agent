/**
 * OTel GenAI Semantic Convention–aligned monitoring schema.
 *
 * References:
 *   - https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
 *   - https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/
 *   - https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/
 *
 * Attribute names use OTel dot-notation stored as flat keys so the
 * monitoring UI can parse events from any OTLP-compatible source.
 */

// ── GenAI operation names (OTel well-known values) ──────────────────

export type GenAiOperationName =
  | 'chat'
  | 'invoke_agent'
  | 'execute_tool'
  | 'embeddings'
  | 'text_completion';

// ── Attribute key constants ─────────────────────────────────────────
// Single source of truth — import these instead of repeating strings.

export const K = {
  // OTel core
  TIMESTAMP: 'timestamp' as const,
  TIMESTAMP_MS: 'timestamp.ms' as const,
  TRACE_ID: 'trace.id' as const,
  SPAN_KIND: 'span.kind' as const,

  // GenAI
  OP_NAME: 'gen_ai.operation.name' as const,
  PROVIDER: 'gen_ai.provider.name' as const,
  MODEL: 'gen_ai.request.model' as const,
  CONVERSATION_ID: 'gen_ai.conversation.id' as const,
  INPUT_TOKENS: 'gen_ai.usage.input_tokens' as const,
  OUTPUT_TOKENS: 'gen_ai.usage.output_tokens' as const,
  FINISH_REASONS: 'gen_ai.response.finish_reasons' as const,

  // GenAI tool
  TOOL_NAME: 'gen_ai.tool.name' as const,
  TOOL_CALL_ID: 'gen_ai.tool.call.id' as const,
  TOOL_CALL_ARGS: 'gen_ai.tool.call.arguments' as const,
  TOOL_CALL_RESULT: 'gen_ai.tool.call.result' as const,

  // Stallion extensions
  AGENT_SLUG: 'stallion.agent.slug' as const,
  AGENT_STEPS: 'stallion.agent.steps' as const,
  AGENT_MAX_STEPS: 'stallion.agent.max_steps' as const,
  INPUT_CHARS: 'stallion.input.chars' as const,
  OUTPUT_CHARS: 'stallion.output.chars' as const,
  ARTIFACTS: 'stallion.artifacts' as const,
  USER_ID: 'stallion.user.id' as const,

  // Health
  HEALTHY: 'stallion.health.healthy' as const,
  HEALTH_CHECKS: 'stallion.health.checks' as const,
  HEALTH_INTEGRATIONS: 'stallion.health.integrations' as const,

  // Reasoning
  REASONING_TEXT: 'stallion.reasoning.text' as const,

  // Agent telemetry ingest
  AT_SESSION_ID: 'stallion.agent_telemetry.session_id' as const,
  AT_EVENT_ID: 'stallion.agent_telemetry.event_id' as const,
  AT_SCHEMA_VERSION: 'stallion.agent_telemetry.schema_version' as const,
  AT_CONTEXT: 'stallion.agent_telemetry.context' as const,
  AT_ENRICHMENT: 'stallion.agent_telemetry.enrichment' as const,

  // System protocol events
  SYSTEM_TYPE: 'stallion.system.type' as const,
} as const;

// Operation name constants
export const OP = {
  CHAT: 'chat' as const,
  INVOKE_AGENT: 'invoke_agent' as const,
  EXECUTE_TOOL: 'execute_tool' as const,
} as const;

// Span kind constants
export const SPAN = {
  START: 'start' as const,
  END: 'end' as const,
  EVENT: 'event' as const,
  LOG: 'log' as const,
} as const;

// ── Monitoring event: OTel-shaped, flat attributes ──────────────────

export interface MonitoringEvent {
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Epoch ms for sorting/filtering */
  'timestamp.ms': number;
  /** OTel trace ID */
  'trace.id': string;

  // ── GenAI core ──
  'gen_ai.operation.name': GenAiOperationName;
  'gen_ai.provider.name'?: string;          // 'aws.bedrock' | 'stallion' | 'acp'
  'gen_ai.request.model'?: string;
  'gen_ai.conversation.id'?: string;

  // ── GenAI usage (set on span end / agent-complete) ──
  'gen_ai.usage.input_tokens'?: number;
  'gen_ai.usage.output_tokens'?: number;
  'gen_ai.response.finish_reasons'?: string[];

  // ── GenAI tool (set on execute_tool spans) ──
  'gen_ai.tool.name'?: string;
  'gen_ai.tool.call.id'?: string;
  'gen_ai.tool.call.arguments'?: unknown;
  'gen_ai.tool.call.result'?: unknown;

  // ── Span lifecycle ──
  'span.kind': 'start' | 'end' | 'event' | 'log';

  // ── Stallion extensions (namespaced) ──
  'stallion.agent.slug'?: string;
  'stallion.agent.steps'?: number;
  'stallion.agent.max_steps'?: number;
  'stallion.input.chars'?: number;
  'stallion.output.chars'?: number;
  'stallion.artifacts'?: Array<{ type: string; name?: string; content?: unknown }>;
  'stallion.user.id'?: string;

  // ── Health (log records) ──
  'stallion.health.healthy'?: boolean;
  'stallion.health.checks'?: Record<string, boolean>;
  'stallion.health.integrations'?: HealthIntegration[];

  // ── Reasoning (log records) ──
  'stallion.reasoning.text'?: string;

  // ── Agent telemetry ingest (from ACP agents) ──
  'stallion.agent_telemetry.session_id'?: string;
  'stallion.agent_telemetry.event_id'?: string;
  'stallion.agent_telemetry.schema_version'?: string;
  'stallion.agent_telemetry.context'?: AgentTelemetryContext;
  'stallion.agent_telemetry.enrichment'?: AgentTelemetryEnrichment;

  /** Catch-all for forward compatibility */
  [key: string]: unknown;
}

export interface HealthIntegration {
  id: string;
  type: string;
  connected: boolean;
  metadata?: { transport?: string; toolCount?: number };
}

// ── Agent telemetry v0.2.0 ingest types ─────────────────────────────

export interface AgentTelemetryContext {
  cwd?: string;
  tty?: string;
  os?: string;
  shell?: string;
  pid?: number;
}

export interface AgentTelemetryEnrichment {
  system?: {
    os?: string;
    os_version?: string;
    shell?: string;
    runtime_version?: string;
    node_version?: string;
    python_version?: string;
  };
  workspace?: {
    has_git?: boolean;
    git_branch_hash?: string;
    file_count?: number;
    primary_languages?: string;
  };
  auth?: {
    mwinit_active?: boolean;
    mwinit_age_minutes?: number;
    cookie_exists?: boolean;
  };
}

/** Raw event shape from SAAgent telemetry.sh */
export interface AgentTelemetryIngestEvent {
  schema_version: string;
  timestamp: string;
  session_id: string;
  event_id: string;
  event_type: 'session.start' | 'session.end' | 'turn.user' | 'tool.invoke' | 'tool.result' | 'agent.delegate' | 'unknown';
  agent: { name: string; runtime: string; version: string };
  context?: AgentTelemetryContext;
  enrichment?: AgentTelemetryEnrichment;
  turn?: { prompt_text?: string; prompt_length?: number };
  tool?: { name?: string; input?: unknown; output?: unknown };
  session?: { duration_s?: number };
  delegation?: { targets?: unknown[] };
}

// ── OTLP JSON envelope types (subset for receiver) ──────────────────

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes: OtlpKeyValue[];
  events?: OtlpSpanEvent[];
  status?: { code: number; message?: string };
}

export interface OtlpSpanEvent {
  timeUnixNano: string;
  name: string;
  attributes: OtlpKeyValue[];
}

export interface OtlpKeyValue {
  key: string;
  value: OtlpAnyValue;
}

export interface OtlpAnyValue {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values: OtlpAnyValue[] };
}

export interface OtlpLogRecord {
  timeUnixNano: string;
  severityNumber?: number;
  severityText?: string;
  body?: OtlpAnyValue;
  attributes: OtlpKeyValue[];
  traceId?: string;
  spanId?: string;
}

export interface OtlpTracesPayload {
  resourceSpans: Array<{
    resource?: { attributes: OtlpKeyValue[] };
    scopeSpans: Array<{
      scope?: { name: string; version?: string };
      spans: OtlpSpan[];
    }>;
  }>;
}

export interface OtlpLogsPayload {
  resourceLogs: Array<{
    resource?: { attributes: OtlpKeyValue[] };
    scopeLogs: Array<{
      scope?: { name: string; version?: string };
      logRecords: OtlpLogRecord[];
    }>;
  }>;
}

// ── Monitoring stats (unchanged shape, OTel attribute names) ────────

export interface MonitoringStats {
  agents: AgentStats[];
  summary: {
    totalAgents: number;
    activeAgents: number;
    runningAgents: number;
    totalMessages: number;
    totalCost: number;
  };
}

export interface AgentStats {
  slug: string;
  name: string;
  status: 'idle' | 'running';
  model: string;
  conversationCount: number;
  messageCount: number;
  cost: number;
  healthy: boolean;
}
