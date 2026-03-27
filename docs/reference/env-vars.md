# Environment Variables

All environment variables recognized by Stallion, grouped by category.

## Server

| Variable | Default | Description | Source |
|----------|---------|-------------|--------|
| `PORT` | `3141` | Server listen port | `src-server/index.ts` |
| `STALLION_AI_DIR` | `~/.stallion-ai` | Data directory for all runtime state | `src-server/utils/paths.ts` |
| `STALLION_PORT` | `3141` | Port used by the stallion-control MCP server to reach the API | `src-server/tools/stallion-control-server.ts` |
| `STALLION_FEATURES` | _(none)_ | Comma-separated feature flags (e.g. `strands-runtime`) | `src-server/runtime/stallion-runtime.ts` |
| `ALLOWED_ORIGINS` | _(none)_ | Comma-separated additional CORS origins (localhost origins are always allowed) | `src-server/runtime/stallion-runtime.ts` |
| `AWS_REGION` | `us-east-1` | Default AWS region for Bedrock API calls | `src-server/routes/models.ts` |
| `DEBUG_STREAMING` | `false` | Enable verbose SSE streaming debug logs in chat routes | `src-server/routes/chat.ts` |

## Telemetry

| Variable | Default | Description | Source |
|----------|---------|-------------|--------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(none)_ | OTLP collector URL. Telemetry is disabled when unset. | `src-server/telemetry.ts` |
| `OTEL_SERVICE_NAME` | `stallion` | Service name reported in traces and metrics | `src-server/telemetry.ts` |
| `STALLION_TELEMETRY_API_KEY` | _(none)_ | API key sent as `x-api-key` header with OTLP exports | `src-server/telemetry.ts` |

## Frontend

| Variable | Default | Description | Source |
|----------|---------|-------------|--------|
| `VITE_API_BASE` | `http://localhost:3141` | Backend API URL override (build-time, Vite) | `.env.example` |

## AWS IAM Permissions

Minimum IAM policy for Bedrock access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:ListFoundationModels",
        "bedrock:GetFoundationModel"
      ],
      "Resource": "*"
    }
  ]
}
```

For knowledge base embeddings, also add:

```json
{
  "Effect": "Allow",
  "Action": [
    "bedrock:InvokeModel"
  ],
  "Resource": "arn:aws:bedrock:*::foundation-model/amazon.titan-embed-*"
}
```
