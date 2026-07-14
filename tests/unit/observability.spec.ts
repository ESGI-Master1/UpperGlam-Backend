import { test } from '@japa/runner'
import { logBusinessEvent, withSpan } from '#services/observability'

test.group('observability service', () => {
  test('returns values from instrumented spans', async ({ assert }) => {
    const result = await withSpan('test.operation', { userId: 12 }, async () => {
      return 'ok'
    })

    assert.equal(result, 'ok')
  })

  test('rethrows errors from instrumented spans', async ({ assert }) => {
    await assert.rejects(
      () =>
        withSpan('test.failure', { userId: 12 }, async () => {
          throw new Error('boom')
        }),
      'boom'
    )
  })

  test('logs structured business events through the provided logger', ({ assert }) => {
    const calls: Array<{ payload: Record<string, unknown>; message: string }> = []
    const logger = {
      info(payload: Record<string, unknown>, message: string) {
        calls.push({ payload, message })
      },
    }

    logBusinessEvent(
      { logger: logger as never },
      'payment.intent.created',
      {
        userId: 12,
        amountCents: 9000,
        ignored: { nested: true },
      },
      'info'
    )

    assert.lengthOf(calls, 1)
    assert.equal(calls[0].message, 'payment.intent.created')
    assert.containSubset(calls[0].payload, {
      event: 'payment.intent.created',
      userId: 12,
      amountCents: 9000,
      ignored: { nested: true },
    })
  })
})
