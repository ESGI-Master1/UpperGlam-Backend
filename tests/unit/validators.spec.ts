import { errors } from '@vinejs/vine'
import { test } from '@japa/runner'
import { rejectPreRegistrationValidator } from '#validators/admin_pre_registrations'
import {
  forgotPasswordValidator,
  loginValidator,
  registerValidator,
  resetPasswordValidator,
  resetPasswordWithCodeValidator,
} from '#validators/auth'
import {
  checkoutDraftValidator,
  createBookingDraftValidator,
  paymentIntentValidator,
  updateBookingValidator,
  updateProviderProfileValidator,
  uploadCommitValidator,
  uploadPresignValidator,
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

  test('accepts forgot and reset password payloads', async ({ assert }) => {
    assert.deepEqual(await forgotPasswordValidator.validate({ email: ' USER@EXAMPLE.COM ' }), {
      email: 'USER@EXAMPLE.COM',
    })

    assert.deepEqual(
      await resetPasswordValidator.validate({
        token: 'a'.repeat(64),
        password: 'Password123!',
        passwordConfirmation: 'Password123!',
      }),
      {
        token: 'a'.repeat(64),
        password: 'Password123!',
        passwordConfirmation: 'Password123!',
      }
    )

    assert.deepEqual(
      await resetPasswordWithCodeValidator.validate({
        email: 'user@example.com',
        code: '123456',
        password: 'Password123!',
        passwordConfirmation: 'Password123!',
      }),
      {
        email: 'user@example.com',
        code: '123456',
        password: 'Password123!',
        passwordConfirmation: 'Password123!',
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

  test('accepts complete provider profile payloads', async ({ assert }) => {
    assert.deepEqual(
      await updateProviderProfileValidator.validate({
        displayName: '  Maison Upper  ',
        city: '  Paris  ',
        bio: '  Studio premium  ',
        instituteAddress: '  12 rue de Rivoli  ',
        serviceModes: ['home', 'institute'],
        homeServiceZones: ['  Paris 8e  ', 'Neuilly-sur-Seine'],
        priceFromCents: 9000,
      }),
      {
        displayName: 'Maison Upper',
        city: 'Paris',
        bio: 'Studio premium',
        instituteAddress: '12 rue de Rivoli',
        serviceModes: ['home', 'institute'],
        homeServiceZones: ['Paris 8e', 'Neuilly-sur-Seine'],
        priceFromCents: 9000,
      }
    )
  })

  test('accepts booking update and media upload payloads', async ({ assert }) => {
    assert.deepEqual(
      await updateBookingValidator.validate({
        appointmentMode: 'institute',
        address: null,
        note: '  Nouvelle note  ',
      }),
      {
        appointmentMode: 'institute',
        address: null,
        note: 'Nouvelle note',
      }
    )

    assert.deepEqual(
      await uploadPresignValidator.validate({
        category: 'profile',
        extension: ' jpg ',
        mimeType: ' image/jpeg ',
        sizeBytes: 1024,
      }),
      {
        category: 'profile',
        extension: 'jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      }
    )

    assert.deepEqual(
      await uploadCommitValidator.validate({
        category: 'review',
        objectKey: ' users/1/review/photo.webp ',
        mimeType: ' image/webp ',
        sizeBytes: 4096,
      }),
      {
        category: 'review',
        objectKey: 'users/1/review/photo.webp',
        mimeType: 'image/webp',
        sizeBytes: 4096,
      }
    )
  })

  test('rejects unsafe media payloads', async () => {
    await expectValidationError(() =>
      uploadPresignValidator.validate({
        category: 'profile',
        extension: 'x',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      })
    )
    await expectValidationError(() =>
      uploadCommitValidator.validate({
        category: 'review',
        objectKey: 'ok',
        mimeType: 'image/webp',
        sizeBytes: -1,
      })
    )
  })
})

test.group('admin validators', () => {
  test('accepts meaningful rejection reasons', async ({ assert }) => {
    assert.deepEqual(
      await rejectPreRegistrationValidator.validate({ reason: '  Dossier incomplet ' }),
      {
        reason: 'Dossier incomplet',
      }
    )
  })

  test('rejects empty rejection reasons', async () => {
    await expectValidationError(() => rejectPreRegistrationValidator.validate({ reason: 'no' }))
  })
})
