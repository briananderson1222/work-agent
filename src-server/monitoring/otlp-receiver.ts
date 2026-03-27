import { Hono } from 'hono';
import type {
  AgentTelemetryIngestEvent,
  GenAiOperationName,
  MonitoringEvent,
  OtlpAnyValue,
  OtlpKeyValue,
  OtlpLogsPayload,
  OtlpTracesPayload,
} from './schema.js';
import { K, OP, SPAN } from './schema.js';

function getAttr(attrs: OtlpKeyValue[], key: string): OtlpAnyValue | undefined {
  return attrs.find((a) => a.key === key)?.value;
}

function attrStr(attrs: OtlpKeyValue[], key: string): string | undefined {
  return getAttr(attrs, key)?.stringValue;
}

function attrNum(attrs: OtlpKeyValue[], key: string): number | undefined {
  const v = getAttr(attrs, key);
  if (!v) return undefined;
  if (v.intValue !== undefined) return Number(v.intValue);
  return v.doubleValue;
}

function nowMs(): number {
  return Date.now();
}

function baseEvent(
  traceId: string,
  attrs: OtlpKeyValue[],
  spanKind: MonitoringEvent['span.kind'],
): MonitoringEvent {
  return {
    timestamp: new Date().toISOString(),
    [K.TIMESTAMP_MS]: nowMs(),
    [K.TRACE_ID]: traceId,
    [K.OP_NAME]: (attrStr(attrs, K.OP_NAME) as GenAiOperationName) ?? OP.CHAT,
    [K.PROVIDER]: attrStr(attrs, K.PROVIDER),
    [K.MODEL]: attrStr(attrs, K.MODEL),
    [K.CONVERSATION_ID]: attrStr(attrs, K.CONVERSATION_ID),
    [K.INPUT_TOKENS]: attrNum(attrs, K.INPUT_TOKENS),
    [K.OUTPUT_TOKENS]: attrNum(attrs, K.OUTPUT_TOKENS),
    [K.TOOL_NAME]: attrStr(attrs, K.TOOL_NAME),
    [K.TOOL_CALL_ID]: attrStr(attrs, K.TOOL_CALL_ID),
    [K.AGENT_SLUG]: attrStr(attrs, K.AGENT_SLUG),
    [K.SPAN_KIND]: spanKind,
  };
}

export function createOtlpReceiverRoutes(
  emit: (event: MonitoringEvent) => void,
): Hono {
  const app = new Hono();

  app.post('/v1/traces', async (c) => {
    try {
      const body = await c.req.json<OtlpTracesPayload>();
      let accepted = 0;
      for (const rs of body.resourceSpans) {
        for (const ss of rs.scopeSpans) {
          for (const span of ss.spans) {
            const kind: MonitoringEvent['span.kind'] = span.endTimeUnixNano
              ? SPAN.END
              : SPAN.START;
            emit(baseEvent(span.traceId, span.attributes, kind));
            accepted++;
          }
        }
      }
      return c.json({ success: true, accepted });
    } catch {
      return c.json({ error: 'parse error' }, 400);
    }
  });

  app.post('/v1/logs', async (c) => {
    try {
      const body = await c.req.json<OtlpLogsPayload>();
      let accepted = 0;
      for (const rl of body.resourceLogs) {
        for (const sl of rl.scopeLogs) {
          for (const rec of sl.logRecords) {
            emit(baseEvent(rec.traceId ?? '', rec.attributes, SPAN.LOG));
            accepted++;
          }
        }
      }
      return c.json({ success: true, accepted });
    } catch {
      return c.json({ error: 'parse error' }, 400);
    }
  });

  const EVENT_OP: Record<
    AgentTelemetryIngestEvent['event_type'],
    GenAiOperationName
  > = {
    'session.start': OP.INVOKE_AGENT,
    'session.end': OP.INVOKE_AGENT,
    'turn.user': OP.CHAT,
    'tool.invoke': OP.EXECUTE_TOOL,
    'tool.result': OP.EXECUTE_TOOL,
    'agent.delegate': OP.INVOKE_AGENT,
    unknown: OP.CHAT,
  };

  const EVENT_KIND: Record<
    AgentTelemetryIngestEvent['event_type'],
    MonitoringEvent['span.kind']
  > = {
    'session.start': SPAN.START,
    'session.end': SPAN.END,
    'turn.user': SPAN.EVENT,
    'tool.invoke': SPAN.START,
    'tool.result': SPAN.END,
    'agent.delegate': SPAN.EVENT,
    unknown: SPAN.EVENT,
  };

  app.post('/v1/agent-events', async (c) => {
    try {
      const ev = await c.req.json<AgentTelemetryIngestEvent>();
      const tsMs = /^\d+$/.test(ev.timestamp)
        ? Number(ev.timestamp)
        : new Date(ev.timestamp).getTime();
      const event: MonitoringEvent = {
        timestamp: new Date(tsMs).toISOString(),
        [K.TIMESTAMP_MS]: tsMs,
        [K.TRACE_ID]: ev.session_id,
        [K.OP_NAME]: EVENT_OP[ev.event_type],
        [K.SPAN_KIND]: EVENT_KIND[ev.event_type],
        [K.AGENT_SLUG]: ev.agent.name,
        [K.AT_SESSION_ID]: ev.session_id,
        [K.AT_EVENT_ID]: ev.event_id,
        [K.AT_SCHEMA_VERSION]: ev.schema_version,
        [K.AT_CONTEXT]: ev.context,
        [K.AT_ENRICHMENT]: ev.enrichment,
        ...(ev.tool?.name && { [K.TOOL_NAME]: ev.tool.name }),
        ...(ev.tool?.output !== undefined && {
          [K.TOOL_CALL_RESULT]: ev.tool.output,
        }),
      };
      emit(event);
      return c.json({ success: true });
    } catch {
      return c.json({ error: 'parse error' }, 400);
    }
  });

  return app;
}
