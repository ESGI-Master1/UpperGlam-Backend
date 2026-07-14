import { test } from '@japa/runner'
import { formatMollieAmount } from '#services/mollie'
import { makeMolliePayment } from '#tests/helpers/factories'

test.group('mollie helpers', () => {
  test('formats cents using the PSP decimal amount format', ({ assert }) => {
    assert.equal(formatMollieAmount(0), '0.00')
    assert.equal(formatMollieAmount(99), '0.99')
    assert.equal(formatMollieAmount(6500), '65.00')
  })

  test('builds representative payment fixtures for critical payment tests', ({ assert }) => {
    const payment = makeMolliePayment()

    assert.equal(payment.id, 'tr_test')
    assert.equal(payment.status, 'paid')
    assert.deepEqual(payment.metadata, {
      draftId: '20',
      customerUserId: '1',
      method: 'apple_pay',
    })
  })
})
