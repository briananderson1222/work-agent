# Monitoring & Telemetry

Stallion ships a full observability stack: OTel Collector → Prometheus → Grafana for metrics, and Jaeger for distributed traces. Telemetry is a **no-op** when `OTEL_EXPORTER_OTLP_ENDPOINT` is not set — no configuration is required for local development.

## Quick Start

```bash
cd monitoring && docker compose up -d
```

| Service    | URL                        | Credentials     |
|------------|----------------------------|-----------------|
| Grafana    | http://localhost:3333      | admin/stallion   |
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

#### Chat & Tokens

| Metric                      | Description                                              | Labels         |
|-----------------------------|----------------------------------------------------------|----------------|
| `stallion.chat.requests`    | Total chat requests                                      | `agent`        |
| `stallion.tokens.input`     | Input tokens consumed                                    | `agent`        |
| `stallion.tokens.output`    | Output tokens consumed                                   | `agent`        |
| `stallion.tokens.context`   | Fixed context tokens per request (system prompt + MCP tools) | `agent`   |
| `stallion.tool.calls`       | Total tool calls                                         | `tool`         |
| `stallion.chat.errors`      | Total chat errors                                        | `agent`        |
| `stallion.cost.estimated`   | Estimated cost in USD (cumulative)                       | `agent`        |

#### Plugins

| Metric                        | Description              | Labels   |
|-------------------------------|--------------------------|----------|
| `stallion.plugin.installs`    | Plugin install events    | —        |
| `stallion.plugin.uninstalls`  | Plugin uninstall events  | —        |
| `stallion.plugin.updates`     | Plugin update events     | —        |

#### CRUD Operations

| Metric                        | Description              | Labels      |
|-------------------------------|--------------------------|-------------|
| `stallion.agent.operations`   | Agent CRUD operations    | `operation` |
| `stallion.layout.operations`  | Layout CRUD operations   | `operation` |
| `stallion.project.operations` | Project CRUD operations  | `operation` |
| `stallion.prompt.operations`  | Prompt CRUD operations   | `operation` |

#### Providers & Infrastructure

| Metric                             | Description                              | Labels      |
|------------------------------------|------------------------------------------|-------------|
| `stallion.provider.operations`     | Provider register/remove/health events   | `op`        |
| `stallion.notification.operations` | Notification schedule/deliver/dismiss    | `op`        |
| `stallion.scheduler.job.runs`      | Scheduler job executions                 | —           |
| `stallion.mcp.lifecycle`           | MCP connection lifecycle events          | `event`     |
| `stallion.knowledge.operations`    | Knowledge query/index operations         | `op`        |
| `stallion.feedback.operations`     | Feedback submission events               | `op`        |
| `stallion.approval.operations`     | Tool approval request/approve/deny       | `op`        |
| `stallion.terminal.operations`     | Terminal session lifecycle events        | `op`        |
| `stallion.acp.operations`          | ACP connection lifecycle events          | `op`        |
| `stallion.voice.operations`        | Voice session lifecycle events           | `op`        |
| `stallion.template.operations`     | Template list/apply events               | `op`        |
| `stallion.conversation.operations` | Conversation lifecycle events            | `operation` |
| `stallion.coding.operations`       | Coding session events                    | `op`        |
| `stallion.auth.operations`         | Auth lifecycle events                    | `op`        |
| `stallion.filetree.operations`     | File tree browse events                  | `op`        |
| `stallion.registry.operations`     | Registry install/uninstall events        | `op`        |

#### Skills

| Metric                          | Description              | Labels |
|---------------------------------|--------------------------|--------|
| `stallion.skill.discoveries`    | Skill discovery events   | —      |
| `stallion.skill.activations`    | Skill activation events  | —      |

#### Other

| Metric                          | Description                    | Labels |
|---------------------------------|--------------------------------|--------|
| `stallion.analytics.operations` | Analytics query events         | `op`   |
| `stallion.bedrock.operations`   | Bedrock model catalog events   | `op`   |
| `stallion.config.operations`    | App config read/write events   | `op`   |
| `stallion.sse.operations`       | SSE connection events          | `op`   |
| `stallion.insight.operations`   | Insight query events           | `op`   |
| `stallion.system.operations`    | System status/verify events    | `op`   |
| `stallion.uicommand.operations` | UI command execution events    | `op`   |

### Histograms

| Metric                              | Unit | Description                            | Labels  |
|-------------------------------------|------|----------------------------------------|---------|
| `stallion.chat.duration`            | ms   | Chat request duration                  | `agent` |
| `stallion.tool.duration`            | ms   | Tool execution duration                | `tool`  |
| `stallion.scheduler.job.duration`   | ms   | Scheduler job execution duration       | —       |
| `stallion.approval.duration`        | ms   | Time from approval request to decision | —       |
| `stallion.voice.duration`           | ms   | Voice session duration                 | —       |
| `stallion.skill.activation.duration`| ms   | Skill activation duration              | —       |

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

The dashboard (`monitoring/grafana/dashboards/stallion.json`) contains 28 panels:

| # | Title | Type | Category |
|---|-------|------|----------|
| 1 | Chat Requests | stat | General |
| 2 | Active Agents | stat | General |
| 3 | MCP Connections | stat | General |
| 4 | Errors | stat | General |
| 5 | Estimated Cost | stat | General |
| 6 | Chat p95 | stat | General |
| 7 | Requests Over Time | timeseries | General |
| 8 | Token Consumption | timeseries | General |
| 9 | Requests by Agent | bargauge | General |
| 10 | Tool Calls | bargauge | General |
| 11 | Agent Operations | bargauge | CRUD Operations |
| 12 | Layout Operations | bargauge | CRUD Operations |
| 13 | Prompt Operations | bargauge | CRUD Operations |
| 14 | Project Operations | bargauge | CRUD Operations |
| 15 | Plugin Activity | bargauge | Plugins |
| 16 | Plugin Events Over Time | timeseries | Plugins |
| 17 | Notifications | bargauge | Notifications & Scheduler |
| 18 | Scheduler Jobs | bargauge | Notifications & Scheduler |
| 19 | Scheduler Job Duration | timeseries | Notifications & Scheduler |
| 20 | Provider Operations | bargauge | Providers & MCP |
| 21 | MCP Lifecycle | bargauge | Providers & MCP |
| 22 | Knowledge Operations | bargauge | Providers & MCP |
| 23 | Tool Duration (p95) | timeseries | Performance |
| 24 | Chat Duration Distribution | timeseries | Performance |
| 25 | Context Overhead vs Input Tokens | timeseries | Performance |
| 26 | Error Rate | timeseries | Performance |
| 27 | Cost by Agent | bargauge | Performance |
| 28 | Token Usage | stat | Performance |

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

## Application-Level Monitoring (MonitoringEmitter)

Beyond OTel infrastructure metrics, Stallion tracks GenAI-specific events through the `MonitoringEmitter` class. This is a separate system from OTel — it captures structured events about agent conversations, tool calls, and health checks.

### Architecture

```
StreamOrchestrator / ACPBridge
  └─ MonitoringEmitter (src-server/monitoring/emitter.ts)
       ├─ EventBus (SSE fan-out to /monitoring/events)
       └─ Disk persistence (events-YYYY-MM-DD.ndjson)
```

The emitter is injected into the streaming pipeline and ACP bridge. It captures events at key lifecycle points without coupling to any specific transport.

### Event Schema

Events follow the [OTel GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/) with Stallion extensions. Defined in `src-server/monitoring/schema.ts`.

Core attributes (every event):

| Attribute | Type | Description |
|-----------|------|-------------|
| `timestamp` | string | ISO-8601 |
| `timestamp.ms` | number | Epoch ms for sorting |
| `trace.id` | string | Groups related events |
| `gen_ai.operation.name` | string | `chat`, `invoke_agent`, `execute_tool` |
| `span.kind` | string | `start`, `end`, `event`, `log` |

GenAI attributes (set per operation type):

| Attribute | Set On | Description |
|-----------|--------|-------------|
| `gen_ai.request.model` | agent start/end | Model ID |
| `gen_ai.conversation.id` | all agent events | Conversation ID |
| `gen_ai.usage.input_tokens` | agent complete | Input token count |
| `gen_ai.usage.output_tokens` | agent complete | Output token count |
| `gen_ai.tool.name` | tool call/result | Tool name |
| `gen_ai.tool.call.id` | tool call/result | Unique call ID |

Stallion extensions:

| Attribute | Description |
|-----------|-------------|
| `stallion.agent.slug` | Agent identifier |
| `stallion.agent.steps` | Steps taken in agent loop |
| `stallion.input.chars` | Input character count |
| `stallion.output.chars` | Output character count |
| `stallion.user.id` | User identifier |
| `stallion.reasoning.text` | Extended thinking content |

### Emitter Methods

| Method | When | Key Data |
|--------|------|----------|
| `emitAgentStart` | Chat request begins | slug, model, input |
| `emitAgentComplete` | Chat request ends | tokens, steps, finish reason |
| `emitToolCall` | Tool execution starts | tool name, arguments |
| `emitToolResult` | Tool execution ends | tool name, result |
| `emitReasoning` | Extended thinking | reasoning text |
| `emitHealth` | Health check | healthy, checks, integrations |
| `emitRaw` | Custom events | any MonitoringEvent |

### Consuming Events

**SSE stream**: `GET /monitoring/events` — real-time event stream for the Monitoring view.

**Disk**: Events persist to `~/.stallion-ai/monitoring/events-YYYY-MM-DD.ndjson` (one JSON object per line). Historical events are queryable via `GET /monitoring/events?start=<iso-or-ms>&end=<iso-or-ms>`.

**UI**: The Monitoring view (`MonitoringContext.tsx`) subscribes to the SSE stream and displays events in real-time with filtering by agent, operation type, and time range.

### Insights API

`GET /api/insights` aggregates event data from the monitoring directory for the Insights Dashboard.

- Reads all `events-*.ndjson` files from `~/.stallion-ai/monitoring/`
- Returns parsed events for analytics and feedback analysis
- Used by the `InsightsDashboard` component alongside the feedback tab
