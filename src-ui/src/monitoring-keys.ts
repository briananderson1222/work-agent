/** OTel attribute key constants — mirrors src-server/monitoring/schema.ts */
export const K = {
  TIMESTAMP: 'timestamp',
  TIMESTAMP_MS: 'timestamp.ms',
  TRACE_ID: 'trace.id',
  SPAN_KIND: 'span.kind',
  OP_NAME: 'gen_ai.operation.name',
  PROVIDER: 'gen_ai.provider.name',
  MODEL: 'gen_ai.request.model',
  CONVERSATION_ID: 'gen_ai.conversation.id',
  INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  FINISH_REASONS: 'gen_ai.response.finish_reasons',
  TOOL_NAME: 'gen_ai.tool.name',
  TOOL_CALL_ID: 'gen_ai.tool.call.id',
  TOOL_CALL_ARGS: 'gen_ai.tool.call.arguments',
  TOOL_CALL_RESULT: 'gen_ai.tool.call.result',
  AGENT_SLUG: 'stallion.agent.slug',
  AGENT_STEPS: 'stallion.agent.steps',
  AGENT_MAX_STEPS: 'stallion.agent.max_steps',
  INPUT_CHARS: 'stallion.input.chars',
  OUTPUT_CHARS: 'stallion.output.chars',
  ARTIFACTS: 'stallion.artifacts',
  USER_ID: 'stallion.user.id',
  HEALTHY: 'stallion.health.healthy',
  HEALTH_CHECKS: 'stallion.health.checks',
  HEALTH_INTEGRATIONS: 'stallion.health.integrations',
  REASONING_TEXT: 'stallion.reasoning.text',
  AT_SESSION_ID: 'stallion.agent_telemetry.session_id',
  AT_EVENT_ID: 'stallion.agent_telemetry.event_id',
  AT_SCHEMA_VERSION: 'stallion.agent_telemetry.schema_version',
  AT_CONTEXT: 'stallion.agent_telemetry.context',
  AT_ENRICHMENT: 'stallion.agent_telemetry.enrichment',
  SYSTEM_TYPE: 'stallion.system.type',
} as const;

export const OP = {
  CHAT: 'chat',
  INVOKE_AGENT: 'invoke_agent',
  EXECUTE_TOOL: 'execute_tool',
} as const;

export const SPAN = {
  START: 'start',
  END: 'end',
  EVENT: 'event',
  LOG: 'log',
} as const;
