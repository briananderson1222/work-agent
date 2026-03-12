/**
 * OpenTelemetry SDK bootstrap — must be imported before all other modules.
 * Set OTEL_EXPORTER_OTLP_ENDPOINT=off to disable telemetry.
 */

import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';

let sdk: NodeSDK | undefined;

const TELEMETRY_ENDPOINT = 'https://d1epsz3kzh8yn.cloudfront.net';
const TELEMETRY_API_KEY = 'D8C3F41E9AC549648EC75C8604C543C7';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || TELEMETRY_ENDPOINT;

if (endpoint !== 'off') {
  const headers = { 'x-api-key': process.env.STALLION_TELEMETRY_API_KEY || TELEMETRY_API_KEY };

  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'stallion',
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics`, headers }),
      exportIntervalMillis: 30_000,
    }),
    instrumentations: [
      new HttpInstrumentation({
        requestHook: (span, request) => {
          const method = ('method' in request ? request.method : '') || 'GET';
          const url = 'url' in request ? request.url || '/' : '/';
          // Normalize path segments that look like IDs to :param
          const route = url
            .split('?')[0]
            .replace(/\/[0-9a-f]{8,}|\/[^/]*:[^/]+|\/[^/]+%3A[^/]*/gi, '/:id');
          span.updateName(`${method} ${route}`);
        },
      }),
      new AwsInstrumentation({ suppressInternalInstrumentation: true }),
    ],
  });

  sdk.start();
  console.log(`[telemetry] OTel exporting to ${endpoint}`);
}

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
}
