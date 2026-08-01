import env from '#start/env'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { NodeSDK } from '@opentelemetry/sdk-node'
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'

const telemetryEnabled = env.get('OTEL_ENABLED') ?? env.get('NODE_ENV') === 'production'

if (telemetryEnabled) {
  const otlpEndpoint = env.get('OTEL_EXPORTER_OTLP_ENDPOINT')
  const serviceName = env.get('OTEL_SERVICE_NAME') ?? env.get('APP_NAME', 'upperglam-backend')
  const posthogProjectToken = env.get('POSTHOG_PROJECT_TOKEN')
  const posthogLogsEndpoint =
    env.get('POSTHOG_LOGS_ENDPOINT') ?? 'https://us.i.posthog.com/i/v1/logs'
  const logRecordProcessors =
    env.get('NODE_ENV') === 'production' && posthogProjectToken
      ? [
          new BatchLogRecordProcessor({
            exporter: new OTLPLogExporter({
              url: posthogLogsEndpoint,
              headers: {
                Authorization: `Bearer ${posthogProjectToken}`,
              },
            }),
          }),
        ]
      : undefined

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: '0.0.0',
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: env.get('NODE_ENV'),
    }),
    traceExporter: otlpEndpoint
      ? new OTLPTraceExporter({
          url: `${otlpEndpoint.replace(/\/$/, '')}/v1/traces`,
        })
      : undefined,
    logRecordProcessors,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
      }),
    ],
  })

  sdk.start()

  const shutdown = async () => {
    await sdk.shutdown()
  }

  process.once('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0))
  })
  process.once('SIGINT', () => {
    void shutdown().finally(() => process.exit(0))
  })
}
