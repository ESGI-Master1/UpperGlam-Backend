import { test } from '@japa/runner'
import { ApiHttpError, dataResponse, errorResponse, parsePositiveInt } from '#services/http'

test.group('http helpers', () => {
  test('wraps successful payloads with optional metadata and messages', ({ assert }) => {
    assert.deepEqual(dataResponse({ id: 12 }, { meta: { page: 1 }, message: 'OK' }), {
      data: { id: 12 },
      meta: { page: 1 },
      message: 'OK',
    })
  })

  test('wraps API errors consistently', ({ assert }) => {
    const payload = {
      code: 'BOOKING_SLOT_UNAVAILABLE',
      message: "Le créneau n'est plus disponible.",
      details: { slot: '2026-07-14T09:00:00.000Z' },
    }

    assert.deepEqual(errorResponse(payload), { error: payload })
  })

  test('normalizes bounded positive integers', ({ assert }) => {
    assert.equal(parsePositiveInt('3', 1, { min: 1, max: 10 }), 3)
    assert.equal(parsePositiveInt('0', 2, { min: 1, max: 10 }), 2)
    assert.equal(parsePositiveInt('abc', 5, { min: 1, max: 10 }), 5)
    assert.equal(parsePositiveInt('999', 1, { min: 1, max: 100 }), 100)
  })

  test('keeps HTTP status and payload on domain errors', ({ assert }) => {
    const error = new ApiHttpError(409, {
      code: 'PAYMENT_NOT_CONFIRMED',
      message: 'Le paiement n’a pas été confirmé par le PSP.',
    })

    assert.equal(error.status, 409)
    assert.equal(error.message, 'Le paiement n’a pas été confirmé par le PSP.')
    assert.deepEqual(error.payload, {
      code: 'PAYMENT_NOT_CONFIRMED',
      message: 'Le paiement n’a pas été confirmé par le PSP.',
    })
  })
})
