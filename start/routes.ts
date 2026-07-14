/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const AuthController = () => import('#controllers/auth_controller')
const PreRegistrationsController = () =>
  import('#infrastructure/http/controllers/pre_registrations_controller')
const ProvidersController = () => import('#controllers/providers_controller')
const ProvidersMeController = () => import('#controllers/providers_me_controller')
const BookingsController = () => import('#controllers/bookings_controller')
const UsersController = () => import('#controllers/users_controller')
const UploadsController = () => import('#controllers/uploads_controller')
const AdminPreRegistrationsController = () =>
  import('#controllers/admin_pre_registrations_controller')

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

router
  .group(() => {
    router.post('/auth/register', [AuthController, 'register'])
    router.post('/auth/login', [AuthController, 'login'])
  })
  .use(middleware.rateLimit({ keyPrefix: 'auth', max: 10, windowMs: 60_000 }))

router
  .group(() => {
    router.post('/auth/forgot-password', [AuthController, 'forgotPassword'])
    router.post('/auth/reset-password', [AuthController, 'resetPassword'])
    router.post('/auth/reset-password-with-code', [AuthController, 'resetPasswordWithCode'])
  })
  .use(middleware.rateLimit({ keyPrefix: 'password-reset', max: 5, windowMs: 60_000 }))

router
  .post('/pre-registration', [PreRegistrationsController, 'store'])
  .use(middleware.rateLimit({ keyPrefix: 'pre-registration', max: 8, windowMs: 60_000 }))

router
  .post('/payments/webhooks/mollie', [BookingsController, 'mollieWebhook'])
  .use(middleware.rateLimit({ keyPrefix: 'mollie-webhook', max: 120, windowMs: 60_000 }))

router.get('/providers/tags', [ProvidersController, 'tags'])
router.get('/providers/featured', [ProvidersController, 'featured'])
router.get('/providers', [ProvidersController, 'index'])
router.get('/providers/:providerId', [ProvidersController, 'show'])
router.get('/providers/:providerId/reviews', [ProvidersController, 'reviews'])
router.get('/providers/:providerId/availability', [ProvidersController, 'availability'])

router
  .group(() => {
    router.get('/auth/me', [AuthController, 'me'])
    router.post('/auth/logout', [AuthController, 'logout'])

    router.post('/bookings/drafts', [BookingsController, 'createDraft'])
    router.get('/bookings/drafts/:draftId', [BookingsController, 'getDraft'])
    router.post('/bookings/drafts/:draftId/checkout', [BookingsController, 'checkoutDraft'])
    router
      .post('/payments/intents', [BookingsController, 'createPaymentIntent'])
      .use(middleware.rateLimit({ keyPrefix: 'payment-intent', max: 10, windowMs: 60_000 }))
    router.get('/bookings/me', [BookingsController, 'me'])
    router.get('/bookings/:bookingId', [BookingsController, 'show'])
    router.patch('/bookings/:bookingId', [BookingsController, 'update'])
    router.post('/bookings/:bookingId/cancel', [BookingsController, 'cancel'])

    router.get('/users/me', [UsersController, 'me'])
    router.patch('/users/me', [UsersController, 'updateMe'])
    router.patch('/users/me/preferences', [UsersController, 'updatePreferences'])
    router.get('/users/me/shortcuts', [UsersController, 'getShortcuts'])
    router.put('/users/me/shortcuts', [UsersController, 'putShortcuts'])
    router.post('/users/me/avatar', [UsersController, 'linkAvatar'])

    router.post('/uploads/presign', [UploadsController, 'presign'])
    router.post('/uploads/commit', [UploadsController, 'commit'])
    router.get('/media/:mediaId', [UploadsController, 'getMediaUrl'])

    router
      .group(() => {
        router.get('/providers/me/dashboard', [ProvidersMeController, 'dashboard'])
        router.get('/providers/me/profile', [ProvidersMeController, 'profile'])
        router.patch('/providers/me/profile', [ProvidersMeController, 'updateProfile'])
        router.get('/providers/me/bookings', [ProvidersMeController, 'bookings'])
        router.get('/providers/me/availability', [ProvidersMeController, 'availability'])
        router.post('/providers/me/availability', [ProvidersMeController, 'createAvailability'])
        router.delete('/providers/me/availability/:slotId', [
          ProvidersMeController,
          'deleteAvailability',
        ])
        router.get('/providers/me/revenue', [ProvidersMeController, 'revenue'])
      })
      .use(middleware.provider())
  })
  .use(
    middleware.auth({
      guards: ['api'],
    })
  )

router
  .group(() => {
    router.get('/admin/audit-events', [AdminPreRegistrationsController, 'auditEvents'])
    router.get('/admin/pre-registrations', [AdminPreRegistrationsController, 'index'])
    router.get('/admin/pre-registrations/:preRegistrationId', [
      AdminPreRegistrationsController,
      'show',
    ])
    router.post('/admin/pre-registrations/:preRegistrationId/approve', [
      AdminPreRegistrationsController,
      'approve',
    ])
    router.post('/admin/pre-registrations/:preRegistrationId/reject', [
      AdminPreRegistrationsController,
      'reject',
    ])
  })
  .use(
    middleware.auth({
      guards: ['api'],
    })
  )
  .use(middleware.admin())
