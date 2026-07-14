import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { SpanStatusCode, trace } from '@opentelemetry/api'
import { getActiveTraceIds, recordException } from '#services/observability'

function normalizePath(path: string) {
  return path.replace(/\/\d+(?=\/|$)/g, '/:id').replace(/\/[0-9a-fA-F-]{16,}(?=\/|$)/g, '/:id')
}

export default class ObservabilityMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const startedAt = performance.now()
    const method = ctx.request.method()
    const path = normalizePath(ctx.request.url().split('?')[0] ?? '/')
    const user = ctx.auth?.user

    const span = trace.getActiveSpan()
    span?.setAttributes({
      'http.request.method': method,
      'url.path': path,
      'user.id': user?.id ? String(user.id) : undefined,
    })

    try {
      await next()
    } catch (error) {
      recordException(error, {
        'http.request.method': method,
        'url.path': path,
      })
      throw error
    } finally {
      const durationMs = Math.round(performance.now() - startedAt)
      const statusCode = ctx.response.response.statusCode
      const traceIds = getActiveTraceIds()
      const logPayload = {
        event: 'http.request.completed',
        method,
        path,
        statusCode,
        durationMs,
        userId: user?.id ?? null,
        ...traceIds,
      }

      if (statusCode >= 500) {
        span?.setStatus({ code: SpanStatusCode.ERROR })
        ctx.logger.error(logPayload, 'http.request.completed')
      } else if (statusCode >= 400) {
        ctx.logger.warn(logPayload, 'http.request.completed')
      } else {
        ctx.logger.info(logPayload, 'http.request.completed')
      }
    }
  }
}
