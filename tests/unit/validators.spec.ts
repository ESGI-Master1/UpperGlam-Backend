import { errors } from '@vinejs/vine'
import { test } from '@japa/runner'
import { loginValidator, registerValidator, resetPasswordWithCodeValidator } from '#validators/auth'
import {
  checkoutDraftValidator,
  createBookingDraftValidator,
  paymentIntentValidator,
  updateProviderProfileValidator,
} from '#validators/mobile'

async function expectValidationError(callback: () => Promise<unknown>) {
  try {
    await callback()
    throw new Error('Expected validation to fail')
  } catch (error) {
    if (error instanceof Error && error.message === 'Expected validation to fail') {
      throw error
    }

    if (!(error instanceof errors.E_VALIDATION_ERROR)) {
      throw error
    }
  }
}

test.group('auth validators', () => {
  test('accepts valid register and login payloads', async ({ assert }) => {
    assert.deepEqual(
      await registerValidator.validate({
        email: ' USER@EXAMPLE.COM ',
        password: 'Password123!',
        deviceName: 'Pixel 8',
      }),
      {
        email: 'USER@EXAMPLE.COM',
        password: 'Password123!',
        deviceName: 'Pixel 8',
      }
    )

    assert.deepEqual(
      await loginValidator.validate({
        email: 'user@example.com',
        password: 'Password123!',
      }),
      {
        email: 'user@example.com',
        password: 'Password123!',
      }
    )
  })

  test('rejects weak auth payloads', async () => {
    await expectValidationError(() =>
      registerValidator.validate({ email: 'not-an-email', password: 'short' })
    )
    await expectValidationError(() =>
      resetPasswordWithCodeValidator.validate({
        email: 'user@example.com',
        code: '123',
        password: 'Password123!',
        passwordConfirmation: 'Password123!',
      })
    )
  })
})

test.group('booking and provider validators', () => {
  test('accepts booking draft, payment intent and checkout payloads', async ({ assert }) => {
    assert.deepEqual(
      await createBookingDraftValidator.validate({
        providerId: 10,
        slot: '2026-07-14T09:00:00.000Z',
        appointmentMode: 'home',
        address: '  12 rue de Lyon  ',
        note: '  Allergie latex  ',
      }),
      {
        providerId: 10,
        slot: '2026-07-14T09:00:00.000Z',
        appointmentMode: 'home',
        address: '12 rue de Lyon',
        note: 'Allergie latex',
      }
    )

    assert.deepEqual(await paymentIntentValidator.validate({ draftId: 42, method: 'apple_pay' }), {
      draftId: 42,
      method: 'apple_pay',
    })

    assert.deepEqual(
      await checkoutDraftValidator.validate({ method: 'google_pay', paymentId: 'tr_test_123' }),
      {
        method: 'google_pay',
        paymentId: 'tr_test_123',
      }
    )
  })

  test('rejects unsafe booking and provider payloads', async () => {
    await expectValidationError(() =>
      paymentIntentValidator.validate({ draftId: -1, method: 'apple_pay' })
    )
    await expectValidationError(() =>
      checkoutDraftValidator.validate({ method: 'card', paymentId: 'tr_test_123' })
    )
    await expectValidationError(() =>
      updateProviderProfileValidator.validate({
        displayName: 'A',
        serviceModes: ['home', 'invalid'],
      })
    )
  })
})
