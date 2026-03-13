# Monitoring & Telemetry

Stallion ships a full observability stack: OTel Collector → Prometheus → Grafana for metrics, and Jaeger for distributed traces. Telemetry is a **no-op** when `OTEL_EXPORTER_OTLP_ENDPOINT` is not set — no configuration is required for local development.

## Quick Start

```bash
docker compose --profile monitoring up -d
```

| Service    | URL                        | Credentials     |
|------------|----------------------------|-----------------|
| Grafana    | http://localhost:3001      | anonymous admin  |
| Prometheus | http://localhost:9090      | —               |
| Jaeger     | http://localhost:16686     | —               |
| Collector  | http://localhost:4318      | OTLP HTTP       |

The Grafana dashboard auto-provisions from `monitoring/grafana/dashboards/stallion.json`. No manual import needed.

## Environment Variables

| Variable                    | Required | Default     | Description                                      |
|-----------------------------|----------|-------------|--------------------------------------------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No     | —           | OTLP HTTP endpoint. Telemetry is disabled if unset. |
| `OTEL_SERVICE_NAME`         | No       | `stallion`  | Service name reported in traces and metrics.     |

To enable telemetry against the local stack:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_SERVICE_NAME=stallion
```

## Stack Architecture

```
Stallion server
  └─ OTel SDK (src-server/telemetry.ts)
       ├─ Traces  → OTLP HTTP :4318/v1/traces  → Collector → Jaeger
       └─ Metrics → OTLP HTTP :4318/v1/metrics → Collector → Prometheus → Grafana
```

The SDK bootstraps in `src-server/telemetry.ts` and **must be imported before all other modules**. It registers:
- `HttpInstrumentation` — auto-instruments HTTP requests, normalising path params to `:id`
- `AwsInstrumentation` — auto-instruments AWS SDK calls
- A `PeriodicExportingMetricReader` that flushes every 30 seconds

## Metrics Reference

All instruments are defined in `src-server/telemetry/metrics.ts` and are safe to import even when no SDK is configured.

### Counters

| Metric                      | Description                                              | Labels         |
|-----------------------------|----------------------------------------------------------|----------------|
| `stallion.chat.requests`    | Total chat requests                                      | `agent`        |
| `stallion.tokens.input`     | Input tokens consumed                                    | `agent`        |
| `stallion.tokens.output`    | Output tokens consumed                                   | `agent`        |
| `stallion.tokens.context`   | Fixed context tokens per request (system prompt + MCP tools) | `agent`   |
| `stallion.tool.calls`       | Total tool calls                                         | `tool`         |
| `stallion.chat.errors`      | Total chat errors                                        | `agent`        |
| `stallion.cost.estimated`   | Estimated cost in USD (cumulative)                       | `agent`        |

### Histograms

| Metric                   | Unit | Description                  | Labels  |
|--------------------------|------|------------------------------|---------|
| `stallion.chat.duration` | ms   | Chat request duration        | `agent` |
| `stallion.tool.duration` | ms   | Tool execution duration      | `tool`  |

### Observable Gauges

Registered via `registerObservableGauges()` in the runtime — callbacks are polled on each export cycle.

| Metric                    | Description                    |
|---------------------------|--------------------------------|
| `stallion.agents.active`  | Number of active agents        |
| `stallion.mcp.connections`| Number of MCP connections      |

### Token Field Fallback Pattern

The AI SDK uses different field names across providers. The runtime normalises this with a fallback:

```ts
tokensInput.add(usage.promptTokens || usage.inputTokens || 0, { agent: slug });
```

`promptTokens` is the Anthropic/OpenAI field; `inputTokens` is used by Bedrock and the Strands adapter. Always apply both fallbacks when reading usage from a model response.

### Cost Tracking

Cost is tracked as a cumulative USD counter (`stallion.cost.estimated`). The runtime computes cost from token counts and model pricing, then calls:

```ts
costEstimated.add(cost, { agent: slug });
```

The Grafana dashboard shows both total estimated cost (stat panel) and cost broken down by agent (bar gauge).

## Grafana Dashboard

The dashboard (`monitoring/grafana/dashboards/stallion.json`) contains 16 panels:

| # | Title | Type | Category |
|---|-------|------|----------|
| 1 | Chat Requests | stat | Requests |
| 2 | Active Agents | stat | Requests |
| 3 | MCP Connections | stat | Requests |
| 4 | Errors | stat | Errors |
| 5 | Chat Duration (p95) | stat | Latency |
| 6 | Token Usage | stat | Tokens |
| 7 | Requests by Agent | bargauge | Requests |
| 8 | Requests Over Time | timeseries | Requests |
| 9 | Token Consumption Over Time | timeseries | Tokens |
| 10 | Tool Calls | bargauge | Tools |
| 11 | Tool Duration (p95) | timeseries | Tools |
| 12 | Context Overhead vs Input Tokens | timeseries | Tokens |
| 13 | Estimated Cost | stat | Costs |
| 14 | Cost by Agent | bargauge | Costs |
| 15 | Error Rate | timeseries | Errors |
| 16 | Chat Duration Distribution | timeseries | Latency |

## Distributed Traces (Jaeger)

Traces are exported via OTLP to the Collector, which forwards them to Jaeger over gRPC (port 4317, insecure).

Access traces at **http://localhost:16686**. Select service `stallion` (or the value of `OTEL_SERVICE_NAME`) from the search dropdown.

Each chat request creates a root span. Tool calls and tool results are added as span events:

```ts
trace.getActiveSpan()?.addEvent('tool-call', {
  'tool.name': chunk.toolName,
  'tool.call_id': chunk.toolCallId,
});
```

The `tracer` export from `src-server/telemetry/metrics.ts` can be used to create custom child spans:

```ts
import { tracer } from '../telemetry/metrics.js';

const span = tracer.startSpan('my-operation');
// ... work ...
span.end();
```

## Adding New Metrics

Follow the pattern used in `MetadataHandler` (`src-server/runtime/streaming/handlers/MetadataHandler.ts`):

**1. Define the instrument in `src-server/telemetry/metrics.ts`:**

```ts
export const myCounter = meter.createCounter('stallion.my.counter', {
  description: 'What this counts',
});
```

**2. Import and record in your handler:**

```ts
import { myCounter } from '../../telemetry/metrics.js';

// Inside your handler logic:
myCounter.add(1, { label: 'value' });
```

**3. Add a Grafana panel** by editing `monitoring/grafana/dashboards/stallion.json` or via the Grafana UI (save JSON back to the file to persist).

The full pattern from `MetadataHandler`:

```ts
import { toolCalls as otelToolCalls, toolDuration as otelToolDuration } from '../../../telemetry/metrics.js';

// On tool-call chunk:
otelToolCalls.add(1, { tool: chunk.toolName || 'unknown' });
this.toolStartTimes.set(chunk.toolCallId, { start: performance.now(), tool: chunk.toolName });

// On tool-result chunk:
const entry = this.toolStartTimes.get(chunk.toolCallId);
if (entry) {
  otelToolDuration.record(performance.now() - entry.start, { tool: entry.tool });
}
```
