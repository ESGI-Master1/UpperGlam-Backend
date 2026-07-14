import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { errorResponse } from '#services/http'
import { logBusinessEvent } from '#services/observability'

type RateLimitOptions = {
  keyPrefix?: string
  max?: number
  windowMs?: number
}

type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

function getClientIp(ctx: HttpContext) {
  const forwardedFor = ctx.request.header('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? 'unknown'
  }

  return ctx.request.ip() ?? 'unknown'
}

export default class RateLimitMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: RateLimitOptions = {}) {
    const max = options.max ?? 60
    const windowMs = options.windowMs ?? 60_000
    const keyPrefix = options.keyPrefix ?? `${ctx.request.method()}:${ctx.request.url()}`
    const key = `${keyPrefix}:${ctx.auth?.user?.id ?? getClientIp(ctx)}`
    const now = Date.now()
    const bucket = buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    bucket.count += 1
    if (bucket.count > max) {
      logBusinessEvent(
        ctx,
        'security.rate_limit.exceeded',
        { keyPrefix, limit: max, windowMs },
        'warn'
      )
      ctx.response.header('Retry-After', Math.ceil((bucket.resetAt - now) / 1000))
      return ctx.response.tooManyRequests(
        errorResponse({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Trop de requêtes. Réessayez dans quelques instants.',
        })
      )
    }

    return next()
  }
}
