# Deployment Guide

## Local Development

```bash
./stallion start                          # Auto-installs, builds, starts server + UI
./stallion start --clean --force          # Wipe and rebuild from scratch
./stallion start --port=3142 --ui-port=3001  # Custom ports
```

## Docker Production

The root `docker-compose.yml` provides a multi-stage production setup:

```bash
docker compose up -d
```

| Service | Port | Description |
|---------|------|-------------|
| `server` | `3141` | Node.js API server |
| `ui` | `5173` | Nginx serving the built frontend |

Data persists in the `stallion-ai-data` Docker volume. To use a `.env` file, place it in the project root — the compose file loads it automatically (optional).

## Docker Development

```bash
docker compose --profile dev up
```

Source code is mounted into the containers with hot reload. AWS credentials are passed through from the host environment (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`).

## Monitoring Stack

The standalone monitoring stack lives in `monitoring/`:

```bash
cd monitoring && docker compose up -d
```

| Service | Port | Description |
|---------|------|-------------|
| Collector | `4318` | OTLP HTTP receiver |
| Prometheus | `9090` | Metrics storage |
| Grafana | `3333` | Dashboards (admin/stallion) |
| Jaeger | `16686` | Distributed traces |

Enable telemetry in the app:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 ./stallion start
```

The root `docker-compose.yml` also has a `--profile monitoring` option with the same services. The standalone stack in `monitoring/` is recommended for independent lifecycle management.

## Reverse Proxy

Example nginx config for production behind a reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name stallion.example.com;

    location /api/ {
        proxy_pass http://localhost:3141/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://localhost:5173/;
        proxy_set_header Host $host;
    }
}
```

WebSocket upgrade headers are required for voice (S2S), terminal sessions, and SSE streaming.

## Environment Configuration

See [Environment Variables](../reference/env-vars.md) for all supported variables and their defaults.

Key variables for deployment:

```bash
PORT=3141                                    # Server port
STALLION_AI_DIR=/data/stallion-ai             # Custom data directory
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318  # Telemetry
ALLOWED_ORIGINS=https://stallion.example.com  # CORS
```
