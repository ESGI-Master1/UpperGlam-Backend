import { test } from '@japa/runner'
import RateLimitMiddleware from '#middleware/rate_limit_middleware'

function makeContext(ip: string) {
  const headers = new Map<string, unknown>()

  return {
    auth: {},
    request: {
      header(name: string) {
        return name === 'x-forwarded-for' ? ip : undefined
      },
      method() {
        return 'POST'
      },
      url() {
        return '/auth/login'
      },
    },
    response: {
      headers,
      header(name: string, value: unknown) {
        headers.set(name, value)
      },
      tooManyRequests(payload: unknown) {
        return { status: 429, payload }
      },
    },
    logger: {
      warn() {},
    },
  }
}

test.group('rate limit middleware', () => {
  test('allows requests until the configured limit then rejects the next one', async ({
    assert,
  }) => {
    const middleware = new RateLimitMiddleware()
    const ctx = makeContext('203.0.113.1')
    let nextCalls = 0
    const next = async () => {
      nextCalls += 1
      return { status: 200 }
    }

    await middleware.handle(ctx as never, next, {
      keyPrefix: 'unit-rate-a',
      max: 2,
      windowMs: 60_000,
    })
    await middleware.handle(ctx as never, next, {
      keyPrefix: 'unit-rate-a',
      max: 2,
      windowMs: 60_000,
    })
    const blocked = await middleware.handle(ctx as never, next, {
      keyPrefix: 'unit-rate-a',
      max: 2,
      windowMs: 60_000,
    })

    assert.equal(nextCalls, 2)
    assert.properties(blocked as { status: number }, { status: 429 })
    assert.equal(ctx.response.headers.get('Retry-After'), 60)
  })

  test('keeps separate buckets by key prefix', async ({ assert }) => {
    const middleware = new RateLimitMiddleware()
    const ctx = makeContext('203.0.113.2')
    let nextCalls = 0
    const next = async () => {
      nextCalls += 1
      return { status: 200 }
    }

    await middleware.handle(ctx as never, next, {
      keyPrefix: 'unit-rate-b',
      max: 1,
      windowMs: 60_000,
    })
    await middleware.handle(ctx as never, next, {
      keyPrefix: 'unit-rate-c',
      max: 1,
      windowMs: 60_000,
    })

    assert.equal(nextCalls, 2)
  })
})
