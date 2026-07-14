import { test } from '@japa/runner'
import { buildOperationalAlertEvent } from '#services/operational_alerts'

test.group('operational alerts', () => {
  test('builds structured alert events for PostHog Logs queries', ({ assert }) => {
    assert.deepEqual(
      buildOperationalAlertEvent({
        area: 'payment',
        severity: 'critical',
        message: 'Payment webhook rejected',
        attributes: {
          code: 'PAYMENT_INTENT_MISMATCH',
          paymentProvider: 'mollie',
        },
      }),
      {
        event: 'alert.payment.critical',
        attributes: {
          alertArea: 'payment',
          alertSeverity: 'critical',
          alertMessage: 'Payment webhook rejected',
          code: 'PAYMENT_INTENT_MISMATCH',
          paymentProvider: 'mollie',
        },
      }
    )
  })
})
