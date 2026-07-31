import { test } from '@japa/runner'
import { formatMollieAmount, isMollieMockPaymentId } from '#services/mollie'
import { makeMolliePayment } from '#tests/helpers/factories'

test.group('mollie helpers', () => {
  test('formats cents using the PSP decimal amount format', ({ assert }) => {
    assert.equal(formatMollieAmount(0), '0.00')
    assert.equal(formatMollieAmount(99), '0.99')
    assert.equal(formatMollieAmount(6500), '65.00')
  })

  test('recognizes only locally simulated payment identifiers', ({ assert }) => {
    assert.isTrue(isMollieMockPaymentId('tr_mock_123456'))
    assert.isFalse(isMollieMockPaymentId('tr_test_123456'))
    assert.isFalse(isMollieMockPaymentId('tr_live_123456'))
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
