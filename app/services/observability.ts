import type { HttpContext } from '@adonisjs/core/http'
import { SpanStatusCode, trace, type Attributes } from '@opentelemetry/api'
import { logs, SeverityNumber, type LogAttributes } from '@opentelemetry/api-logs'

type LogContext = Record<string, unknown>

const tracer = trace.getTracer('upperglam-backend')
const otelLogger = logs.getLogger('upperglam-backend')

function toSpanAttributes(attributes: LogContext): Attributes {
  return Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => {
      if (value === undefined) {
        return false
      }
      return (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        Array.isArray(value)
      )
    })
  ) as Attributes
}

function toLogAttributes(attributes: LogContext): LogAttributes {
  return Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => {
      if (value === undefined || value === null) {
        return false
      }
      return (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        Array.isArray(value)
      )
    })
  ) as LogAttributes
}

function toSeverity(level: 'debug' | 'info' | 'warn' | 'error') {
  if (level === 'debug') {
    return SeverityNumber.DEBUG
  }
  if (level === 'warn') {
    return SeverityNumber.WARN
  }
  if (level === 'error') {
    return SeverityNumber.ERROR
  }
  return SeverityNumber.INFO
}

function errorAttributes(error: unknown) {
  if (error instanceof Error) {
    return {
      'error.name': error.name,
      'error.message': error.message,
    }
  }

  return {
    'error.message': String(error),
  }
}

export function getActiveTraceIds() {
  const spanContext = trace.getActiveSpan()?.spanContext()
  return {
    traceId: spanContext?.traceId,
    spanId: spanContext?.spanId,
  }
}

export function addSpanAttributes(attributes: Attributes) {
  trace.getActiveSpan()?.setAttributes(attributes)
}

export function recordException(error: unknown, attributes: LogContext = {}) {
  const span = trace.getActiveSpan()
  if (!span) {
    return
  }

  if (error instanceof Error) {
    span.recordException(error)
  }
  span.setStatus({ code: SpanStatusCode.ERROR })
  span.setAttributes(toSpanAttributes({ ...attributes, ...errorAttributes(error) }))
}

export async function withSpan<T>(
  name: string,
  attributes: LogContext,
  callback: () => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(
    name,
    { attributes: toSpanAttributes(attributes) },
    async (span) => {
      try {
        const result: T = await callback()
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (error) {
        if (error instanceof Error) {
          span.recordException(error)
        }
        span.setStatus({ code: SpanStatusCode.ERROR })
        span.setAttributes(toSpanAttributes(errorAttributes(error)))
        throw error
      } finally {
        span.end()
      }
    }
  )
}

export function logBusinessEvent(
  ctx: Pick<HttpContext, 'logger'>,
  event: string,
  attributes: LogContext = {},
  level: 'debug' | 'info' | 'warn' | 'error' = 'info'
) {
  const traceIds = getActiveTraceIds()
  ctx.logger[level](
    {
      event,
      ...traceIds,
      ...attributes,
    },
    event
  )
  otelLogger.emit({
    eventName: event,
    severityText: level.toUpperCase(),
    severityNumber: toSeverity(level),
    body: event,
    attributes: toLogAttributes({
      event,
      ...traceIds,
      ...attributes,
    }),
  })
  addSpanAttributes(
    toSpanAttributes(
      Object.fromEntries(
        Object.entries(attributes)
          .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
          .map(([key, value]) => [`upperglam.${key}`, value])
      )
    )
  )
}
