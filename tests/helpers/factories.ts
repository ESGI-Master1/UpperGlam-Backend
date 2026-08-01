import { DateTime } from 'luxon'
import type { MediaAssetAccessRow } from '#services/media_assets'
import type { MolliePayment } from '#services/mollie'

export function makeUser(overrides: Partial<{ id: number; email: string; status: string }> = {}) {
  return {
    id: 1,
    email: 'client@example.com',
    status: 'active',
    ...overrides,
  }
}

export function makeProviderProfile(
  overrides: Partial<{
    id: number
    user_id: number
    price_from_cents: number
    currency: string
  }> = {}
) {
  return {
    id: 10,
    user_id: 2,
    price_from_cents: 6500,
    currency: 'EUR',
    ...overrides,
  }
}

export function makeBookingDraft(
  overrides: Partial<{
    id: number
    status: string
    expires_at: Date
    provider_profile_id: number
    customer_user_id: number
  }> = {}
) {
  return {
    id: 20,
    status: 'pending_payment',
    expires_at: DateTime.utc().plus({ minutes: 30 }).toJSDate(),
    provider_profile_id: 10,
    customer_user_id: 1,
    ...overrides,
  }
}

export function makeBooking(
  overrides: Partial<{
    id: number
    customer_user_id: number
    status: string
    amount_cents: number
  }> = {}
) {
  return {
    id: 30,
    customer_user_id: 1,
    status: 'paid',
    amount_cents: 6500,
    ...overrides,
  }
}

export function makePayment(
  overrides: Partial<{
    id: number
    booking_id: number
    status: string
    provider_transaction_id: string
  }> = {}
) {
  return {
    id: 40,
    booking_id: 30,
    status: 'succeeded',
    provider_transaction_id: 'tr_test',
    ...overrides,
  }
}

export function makeMediaAsset(overrides: Partial<MediaAssetAccessRow> = {}): MediaAssetAccessRow {
  return {
    owner_user_id: 1,
    visibility: 'private',
    ...overrides,
  }
}

export function makeMolliePayment(overrides: Partial<MolliePayment> = {}): MolliePayment {
  return {
    id: 'tr_test',
    status: 'paid',
    amount: {
      currency: 'EUR',
      value: '65.00',
    },
    metadata: {
      draftId: '20',
      customerUserId: '1',
      method: 'apple_pay',
    },
    _links: {
      checkout: {
        href: 'https://checkout.test/tr_test',
      },
      self: {
        href: 'https://api.test/payments/tr_test',
      },
    },
    ...overrides,
  }
}
