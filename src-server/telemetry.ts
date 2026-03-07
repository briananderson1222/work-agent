/**
 * OpenTelemetry SDK bootstrap — must be imported before all other modules.
 * Graceful no-op when OTEL_EXPORTER_OTLP_ENDPOINT is not set.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

let sdk: NodeSDK | undefined;

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'stallion',
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      exportIntervalMillis: 30_000,
    }),
    instrumentations: [
      new HttpInstrumentation({
        requestHook: (span, request) => {
          const method = ('method' in request ? request.method : '') || 'GET';
          const url = 'url' in request ? (request.url || '/') : '/';
          // Normalize path segments that look like IDs to :param
          const route = url.split('?')[0].replace(
            /\/[0-9a-f]{8,}|\/[^/]*:[^/]+|\/[^/]+%3A[^/]*/gi, '/:id'
          );
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
