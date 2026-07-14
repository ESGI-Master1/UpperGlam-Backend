import { randomUUID } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import env from '#start/env'
import { ApiHttpError, dataResponse, errorResponse, parsePositiveInt } from '#services/http'
import {
  createMolliePayment,
  createMollieRefund,
  getMolliePayment,
  isMollieConfigured,
  type MolliePayment,
} from '#services/mollie'
import { expireExpiredBookingDrafts } from '#services/booking_drafts'
import { logBusinessEvent, withSpan } from '#services/observability'
import {
  checkoutDraftValidator,
  createBookingDraftValidator,
  paymentIntentValidator,
  updateBookingValidator,
} from '#validators/mobile'

type BookingRow = {
  id: number
  provider_profile_id: number
  slot_start_at: Date
  slot_end_at?: Date
  appointment_mode: 'home' | 'institute'
  address: string | null
  note: string | null
  amount_cents: string | number
  currency: string
  created_at: Date
  status: 'paid' | 'cancelled'
  confirmation_code: string
}

type PaymentRow = {
  method?: string | null
  provider_transaction_id?: string | null
  status?: PaymentStatus | null
  refund_transaction_id?: string | null
  refunded_at?: Date | string | null
} | null

type PaymentMethod = 'apple_pay' | 'google_pay'
type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded'

type BookingDraftRow = {
  id: number
  customer_user_id: number
  provider_profile_id: number
  slot_start_at: Date
  slot_end_at: Date
  appointment_mode: 'home' | 'institute'
  address: string | null
  note: string | null
  amount_cents: string | number
  currency: string
  status: 'pending_payment' | 'payment_failed' | 'expired' | 'completed'
  expires_at: Date | string
  created_at: Date | string
}

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  return new Date(value).toISOString()
}

function buildBookingDto(booking: BookingRow, payment?: PaymentRow) {
  return {
    id: Number(booking.id),
    providerId: Number(booking.provider_profile_id),
    slot: toIso(booking.slot_start_at),
    appointmentMode: booking.appointment_mode,
    address: booking.address,
    note: booking.note,
    amountCents: Number(booking.amount_cents),
    currency: booking.currency,
    createdAt: toIso(booking.created_at),
    status: booking.status,
    confirmationCode: booking.confirmation_code,
    paymentMethod: payment?.method ?? null,
    transactionId: payment?.provider_transaction_id ?? null,
    paymentStatus: payment?.status ?? null,
    refundTransactionId: payment?.refund_transaction_id ?? null,
    refundedAt: toIso(payment?.refunded_at),
  }
}

function ensureAddressForHomeMode(mode: 'home' | 'institute', address: string | null | undefined) {
  if (mode === 'home' && !address?.trim()) {
    throw new ApiHttpError(422, {
      code: 'VALIDATION_ERROR',
      message: "L'adresse est obligatoire pour un rendez-vous à domicile.",
      details: { field: 'address' },
    })
  }
}

function ensureFutureBooking(slotStartAt: Date | string) {
  const slotDate = DateTime.fromJSDate(
    slotStartAt instanceof Date ? slotStartAt : new Date(slotStartAt),
    {
      zone: 'utc',
    }
  )
  if (slotDate <= DateTime.utc()) {
    throw new ApiHttpError(409, {
      code: 'BOOKING_NOT_MODIFIABLE',
      message: 'Ce rendez-vous n’est plus modifiable.',
    })
  }
}

function ensureMollieConfigured() {
  if (!isMollieConfigured()) {
    throw new ApiHttpError(503, {
      code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
      message: 'Le fournisseur de paiement n’est pas configuré.',
    })
  }
}

function toMollieMethod(method: PaymentMethod) {
  return method === 'apple_pay' ? 'applepay' : 'googlepay'
}

function toPaymentMethod(method: unknown): PaymentMethod {
  return method === 'google_pay' ? 'google_pay' : 'apple_pay'
}

function mapMolliePaymentStatus(status: string): PaymentStatus {
  if (status === 'paid') {
    return 'succeeded'
  }

  if (status === 'failed' || status === 'expired' || status === 'canceled') {
    return 'failed'
  }

  if (status === 'pending' || status === 'authorized' || status === 'open') {
    return 'processing'
  }

  return 'pending'
}

function getRefundCutoffHours() {
  const value = env.get('BOOKING_REFUND_CUTOFF_HOURS')
  return value && value > 0 ? value : 24
}

function getRefundEligibility(slotStartAt: Date | string) {
  const slotDate = DateTime.fromJSDate(
    slotStartAt instanceof Date ? slotStartAt : new Date(slotStartAt),
    { zone: 'utc' }
  )
  const hoursUntilAppointment = slotDate.diff(DateTime.utc(), 'hours').hours

  return {
    canCancel: hoursUntilAppointment > 0,
    refundEligible: hoursUntilAppointment >= getRefundCutoffHours(),
    hoursUntilAppointment,
  }
}

function assertPayableDraft(draft: {
  status: string
  expires_at: Date | string
  amount_cents: string | number
}) {
  if (draft.status !== 'pending_payment') {
    throw new ApiHttpError(409, {
      code: 'BOOKING_DRAFT_NOT_PAYABLE',
      message: 'Ce draft ne peut plus être payé.',
    })
  }

  const expiresAt = DateTime.fromJSDate(
    draft.expires_at instanceof Date ? draft.expires_at : new Date(draft.expires_at),
    { zone: 'utc' }
  )

  if (expiresAt <= DateTime.utc()) {
    throw new ApiHttpError(409, {
      code: 'BOOKING_DRAFT_EXPIRED',
      message: 'Le draft de réservation a expiré.',
    })
  }

  if (Number(draft.amount_cents) <= 0) {
    throw new ApiHttpError(422, {
      code: 'PAYMENT_AMOUNT_INVALID',
      message: 'Le montant de la réservation est invalide.',
    })
  }
}

export default class BookingsController {
  private async getBookingPayment(bookingId: number) {
    return db
      .from('payments')
      .where('booking_id', bookingId)
      .orderBy('created_at', 'desc')
      .select('method', 'provider_transaction_id', 'status', 'refund_transaction_id', 'refunded_at')
      .first()
  }

  private async upsertPaymentIntent(
    trx: TransactionClientContract,
    draft: BookingDraftRow,
    payment: MolliePayment,
    method: PaymentMethod,
    idempotencyKey: string
  ) {
    const status = mapMolliePaymentStatus(payment.status)
    const existing = await trx
      .from('payments')
      .where('provider_transaction_id', payment.id)
      .forUpdate()
      .first()

    const values = {
      booking_draft_id: draft.id,
      method,
      provider: 'mollie',
      provider_transaction_id: payment.id,
      provider_reference: payment._links?.self?.href ?? null,
      checkout_url: payment._links?.checkout?.href ?? null,
      idempotency_key: idempotencyKey,
      status,
      provider_payload: JSON.stringify(payment),
      updated_at: DateTime.utc().toJSDate(),
    }

    if (existing) {
      await trx.from('payments').where('id', existing.id).update(values)
      return { ...existing, ...values }
    }

    const [created] = await trx
      .table('payments')
      .insert({
        ...values,
        created_at: DateTime.utc().toJSDate(),
      })
      .returning('*')

    return created
  }

  private async syncPaymentFromMollie(
    trx: TransactionClientContract,
    payment: MolliePayment,
    fallbackDraft?: BookingDraftRow | null,
    fallbackMethod?: PaymentMethod,
    idempotencyKey?: string
  ) {
    const existing = await trx
      .from('payments')
      .where('provider_transaction_id', payment.id)
      .forUpdate()
      .first()

    const metadata = payment.metadata ?? {}
    const draftId = Number(existing?.booking_draft_id ?? fallbackDraft?.id ?? metadata.draftId)
    const method = toPaymentMethod(existing?.method ?? fallbackMethod ?? metadata.method)
    const draft =
      fallbackDraft ??
      ((await trx
        .from('booking_drafts')
        .where('id', draftId)
        .forUpdate()
        .first()) as BookingDraftRow | null)

    if (!draft) {
      throw new ApiHttpError(404, {
        code: 'BOOKING_DRAFT_NOT_FOUND',
        message: 'Draft de réservation introuvable',
      })
    }

    const key = idempotencyKey ?? existing?.idempotency_key ?? `draft:${draft.id}:${method}`
    const syncedPayment = await this.upsertPaymentIntent(trx, draft, payment, method, key)

    return { draft, payment: syncedPayment, method }
  }

  private assertPaymentMatchesDraft(
    draft: BookingDraftRow,
    payment: MolliePayment,
    userId?: number
  ) {
    const metadata = payment.metadata ?? {}
    const amountMatches =
      Math.round(Number(payment.amount.value) * 100) === Number(draft.amount_cents)
    const currencyMatches =
      payment.amount.currency.toUpperCase() === String(draft.currency).toUpperCase()
    const draftMatches = metadata.draftId === String(draft.id)
    const userMatches = userId === undefined || metadata.customerUserId === String(userId)

    if (!amountMatches || !currencyMatches || !draftMatches || !userMatches) {
      throw new ApiHttpError(409, {
        code: 'PAYMENT_INTENT_MISMATCH',
        message: 'Le paiement ne correspond pas à la réservation.',
      })
    }
  }

  private async completePaidDraft(
    trx: TransactionClientContract,
    draft: BookingDraftRow,
    payment: MolliePayment,
    method: PaymentMethod,
    userId?: number
  ) {
    this.assertPaymentMatchesDraft(draft, payment, userId)

    const existingBooking = await trx.from('bookings').where('draft_id', draft.id).first()
    if (existingBooking) {
      const existingPayment = await trx
        .from('payments')
        .where('booking_draft_id', draft.id)
        .orderBy('created_at', 'desc')
        .select(
          'method',
          'provider_transaction_id',
          'status',
          'refund_transaction_id',
          'refunded_at'
        )
        .first()

      return { booking: existingBooking as BookingRow, payment: existingPayment as PaymentRow }
    }

    if (draft.status !== 'pending_payment') {
      throw new ApiHttpError(409, {
        code: 'BOOKING_DRAFT_NOT_PAYABLE',
        message: 'Ce draft ne peut plus être payé.',
      })
    }

    const slot = await trx
      .from('provider_availability_slots')
      .where('provider_profile_id', draft.provider_profile_id)
      .where('slot_start_at', draft.slot_start_at)
      .forUpdate()
      .first()

    if (!slot || (slot.booking_id && Number(slot.booking_id) > 0)) {
      await trx.from('booking_drafts').where('id', draft.id).update({
        status: 'payment_failed',
        updated_at: DateTime.utc().toJSDate(),
      })
      await trx.from('payments').where('provider_transaction_id', payment.id).update({
        status: 'failed',
        failure_reason: 'slot_unavailable',
        updated_at: DateTime.utc().toJSDate(),
      })

      throw new ApiHttpError(409, {
        code: 'BOOKING_SLOT_UNAVAILABLE',
        message: "Le créneau n'est plus disponible.",
      })
    }

    if (slot.booking_draft_id && Number(slot.booking_draft_id) !== Number(draft.id)) {
      throw new ApiHttpError(409, {
        code: 'BOOKING_SLOT_UNAVAILABLE',
        message: "Le créneau n'est plus disponible.",
      })
    }

    const confirmationCode = `UG-${randomUUID().slice(0, 5).toUpperCase()}`
    const [createdBooking] = await trx
      .table('bookings')
      .insert({
        draft_id: draft.id,
        customer_user_id: draft.customer_user_id,
        provider_profile_id: draft.provider_profile_id,
        slot_start_at: draft.slot_start_at,
        slot_end_at: draft.slot_end_at,
        appointment_mode: draft.appointment_mode,
        address: draft.address,
        note: draft.note,
        amount_cents: draft.amount_cents,
        currency: draft.currency,
        status: 'paid',
        confirmation_code: confirmationCode,
      })
      .returning([
        'id',
        'provider_profile_id',
        'slot_start_at',
        'appointment_mode',
        'address',
        'note',
        'amount_cents',
        'currency',
        'created_at',
        'status',
        'confirmation_code',
      ])

    await trx
      .from('payments')
      .where('provider_transaction_id', payment.id)
      .update({
        booking_id: createdBooking.id,
        method,
        status: 'succeeded',
        provider_payload: JSON.stringify(payment),
        updated_at: DateTime.utc().toJSDate(),
      })

    await trx.from('provider_availability_slots').where('id', slot.id).update({
      is_booked: true,
      booking_id: createdBooking.id,
      booking_draft_id: null,
      updated_at: DateTime.utc().toJSDate(),
    })

    await trx.from('booking_drafts').where('id', draft.id).update({
      status: 'completed',
      updated_at: DateTime.utc().toJSDate(),
    })

    return {
      booking: createdBooking as BookingRow,
      payment: {
        method,
        provider_transaction_id: payment.id,
        status: 'succeeded' as PaymentStatus,
      },
    }
  }

  async createDraft({ auth, request, response, logger }: HttpContext) {
    const payload = await request.validateUsing(createBookingDraftValidator)
    ensureAddressForHomeMode(payload.appointmentMode, payload.address ?? null)
    await expireExpiredBookingDrafts()

    const slotDate = DateTime.fromISO(payload.slot, { zone: 'utc' })
    if (!slotDate.isValid) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'Le format du slot est invalide',
        })
      )
    }

    const user = auth.getUserOrFail()
    const provider = await db.from('provider_profiles').where('id', payload.providerId).first()
    if (!provider) {
      return response.notFound(
        errorResponse({
          code: 'PROVIDER_NOT_FOUND',
          message: 'Prestataire introuvable',
        })
      )
    }

    let draft: BookingDraftRow
    try {
      draft = await db.transaction(async (trx) => {
        const slot = await trx
          .from('provider_availability_slots')
          .where('provider_profile_id', payload.providerId)
          .where('slot_start_at', slotDate.toJSDate())
          .forUpdate()
          .first()

        if (!slot || slot.is_booked || slot.booking_draft_id || slot.booking_id) {
          logBusinessEvent(
            { logger },
            'booking.draft.slot_unavailable',
            { userId: user.id, providerProfileId: payload.providerId },
            'warn'
          )
          throw new ApiHttpError(409, {
            code: 'BOOKING_SLOT_UNAVAILABLE',
            message: "Le créneau n'est plus disponible.",
            details: { slot: payload.slot },
          })
        }

        const [createdDraft] = await trx
          .table('booking_drafts')
          .insert({
            customer_user_id: user.id,
            provider_profile_id: payload.providerId,
            slot_start_at: slot.slot_start_at,
            slot_end_at: slot.slot_end_at,
            appointment_mode: payload.appointmentMode,
            address: payload.address ?? null,
            note: payload.note ?? null,
            amount_cents: provider.price_from_cents ?? 0,
            currency: provider.currency ?? 'EUR',
            status: 'pending_payment',
            expires_at: DateTime.utc().plus({ minutes: 30 }).toJSDate(),
          })
          .returning([
            'id',
            'provider_profile_id',
            'slot_start_at',
            'appointment_mode',
            'address',
            'note',
            'amount_cents',
            'currency',
            'created_at',
            'status',
          ])

        await trx.from('provider_availability_slots').where('id', slot.id).update({
          is_booked: true,
          booking_draft_id: createdDraft.id,
          updated_at: DateTime.utc().toJSDate(),
        })

        return createdDraft as BookingDraftRow
      })
    } catch (error) {
      if (error instanceof ApiHttpError) {
        return response.status(error.status).send(errorResponse(error.payload))
      }

      throw error
    }

    logBusinessEvent({ logger }, 'booking.draft.created', {
      userId: user.id,
      draftId: Number(draft.id),
      providerProfileId: Number(draft.provider_profile_id),
      amountCents: Number(draft.amount_cents),
      currency: draft.currency,
    })

    return response.created(
      dataResponse({
        id: Number(draft.id),
        providerId: Number(draft.provider_profile_id),
        slot: toIso(draft.slot_start_at),
        appointmentMode: draft.appointment_mode,
        address: draft.address,
        note: draft.note,
        amountCents: Number(draft.amount_cents),
        currency: draft.currency,
        createdAt: toIso(draft.created_at),
        status: draft.status,
      })
    )
  }

  async getDraft({ auth, params, response }: HttpContext) {
    const draftId = Number(params.draftId)
    const user = auth.getUserOrFail()
    await expireExpiredBookingDrafts()

    if (!Number.isFinite(draftId) || draftId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'draftId invalide',
        })
      )
    }

    const draft = await db
      .from('booking_drafts')
      .where('id', draftId)
      .where('customer_user_id', user.id)
      .first()

    if (!draft) {
      return response.notFound(
        errorResponse({
          code: 'BOOKING_DRAFT_NOT_FOUND',
          message: 'Draft de réservation introuvable',
        })
      )
    }

    return response.ok(
      dataResponse({
        id: Number(draft.id),
        providerId: Number(draft.provider_profile_id),
        slot: toIso(draft.slot_start_at),
        appointmentMode: draft.appointment_mode,
        address: draft.address,
        note: draft.note,
        amountCents: Number(draft.amount_cents),
        currency: draft.currency,
        createdAt: toIso(draft.created_at),
        status: draft.status,
      })
    )
  }

  async createPaymentIntent({ auth, request, response, logger }: HttpContext) {
    const payload = await request.validateUsing(paymentIntentValidator)
    const user = auth.getUserOrFail()
    await expireExpiredBookingDrafts()
    const idempotencyKey = request.header('Idempotency-Key') ?? `payment:${randomUUID()}`

    try {
      ensureMollieConfigured()
      const draft = (await db
        .from('booking_drafts')
        .where('id', payload.draftId)
        .where('customer_user_id', user.id)
        .first()) as BookingDraftRow | null

      if (!draft) {
        logBusinessEvent(
          { logger },
          'payment.intent.draft_not_found',
          { userId: user.id, draftId: payload.draftId },
          'warn'
        )
        return response.notFound(
          errorResponse({
            code: 'BOOKING_DRAFT_NOT_FOUND',
            message: 'Draft de réservation introuvable',
          })
        )
      }

      const existingPayment = await db
        .from('payments')
        .where('idempotency_key', idempotencyKey)
        .where('booking_draft_id', payload.draftId)
        .first()

      if (existingPayment) {
        return response.ok(
          dataResponse({
            provider: 'mollie',
            paymentId: existingPayment.provider_transaction_id,
            checkoutUrl: existingPayment.checkout_url ?? null,
            status: existingPayment.status,
            amountCents: Number(draft.amount_cents),
            currency: String(draft.currency ?? 'EUR').toUpperCase(),
          })
        )
      }

      try {
        assertPayableDraft(draft)
      } catch (error) {
        if (error instanceof ApiHttpError && error.payload.code === 'BOOKING_DRAFT_EXPIRED') {
          await db.from('booking_drafts').where('id', draft.id).update({
            status: 'expired',
            updated_at: DateTime.utc().toJSDate(),
          })
        }

        throw error
      }

      const payment = await withSpan(
        'payment.mollie.create',
        {
          'payment.provider': 'mollie',
          'payment.method': payload.method,
          'booking.draft_id': Number(draft.id),
          'payment.amount_cents': Number(draft.amount_cents),
          'payment.currency': String(draft.currency ?? 'EUR').toUpperCase(),
        },
        () =>
          createMolliePayment({
            amountCents: Number(draft.amount_cents),
            currency: String(draft.currency ?? 'EUR'),
            description: `Upper Glam réservation ${draft.id}`,
            method: toMollieMethod(payload.method),
            metadata: {
              draftId: String(draft.id),
              customerUserId: String(user.id),
              providerProfileId: String(draft.provider_profile_id),
              method: payload.method,
            },
          })
      )

      await db.transaction(async (trx) => {
        const lockedDraft = (await trx
          .from('booking_drafts')
          .where('id', draft.id)
          .where('customer_user_id', user.id)
          .forUpdate()
          .first()) as BookingDraftRow | null

        if (!lockedDraft) {
          throw new ApiHttpError(404, {
            code: 'BOOKING_DRAFT_NOT_FOUND',
            message: 'Draft de réservation introuvable',
          })
        }

        await this.syncPaymentFromMollie(trx, payment, lockedDraft, payload.method, idempotencyKey)
      })

      logBusinessEvent({ logger }, 'payment.intent.created', {
        userId: user.id,
        draftId: Number(draft.id),
        providerProfileId: Number(draft.provider_profile_id),
        paymentProvider: 'mollie',
        paymentMethod: payload.method,
        paymentStatus: mapMolliePaymentStatus(payment.status),
        amountCents: Number(draft.amount_cents),
        currency: String(draft.currency ?? 'EUR').toUpperCase(),
      })

      return response.ok(
        dataResponse({
          provider: 'mollie',
          paymentId: payment.id,
          checkoutUrl: payment._links?.checkout?.href ?? null,
          status: mapMolliePaymentStatus(payment.status),
          amountCents: Number(draft.amount_cents),
          currency: String(draft.currency ?? 'EUR').toUpperCase(),
        })
      )
    } catch (error) {
      if (error instanceof ApiHttpError) {
        logBusinessEvent(
          { logger },
          'payment.intent.rejected',
          { userId: user.id, draftId: payload.draftId, code: error.payload.code },
          'warn'
        )
        return response.status(error.status).send(errorResponse(error.payload))
      }

      throw error
    }
  }

  async mollieWebhook({ request, response, logger }: HttpContext) {
    const paymentId = String(request.input('id') ?? '').trim()

    if (!paymentId) {
      logBusinessEvent({ logger }, 'payment.webhook.invalid_payload', {}, 'warn')
      return response.badRequest(
        errorResponse({
          code: 'PAYMENT_WEBHOOK_INVALID_PAYLOAD',
          message: 'Identifiant de paiement manquant.',
        })
      )
    }

    try {
      ensureMollieConfigured()
      const molliePayment = await withSpan(
        'payment.mollie.webhook.get',
        { 'payment.provider': 'mollie', 'payment.id': paymentId },
        () => getMolliePayment(paymentId)
      )

      const result = await db.transaction(async (trx) => {
        const synced = await this.syncPaymentFromMollie(trx, molliePayment)
        const paymentStatus = mapMolliePaymentStatus(molliePayment.status)

        if (molliePayment.status === 'paid') {
          const completed = await this.completePaidDraft(
            trx,
            synced.draft,
            molliePayment,
            synced.method
          )

          return {
            action: 'completed',
            bookingId: Number(completed.booking.id),
            draftId: Number(synced.draft.id),
            paymentStatus,
          }
        }

        if (paymentStatus === 'failed') {
          await trx.from('booking_drafts').where('id', synced.draft.id).update({
            status: 'payment_failed',
            updated_at: DateTime.utc().toJSDate(),
          })
          await trx
            .from('provider_availability_slots')
            .where('booking_draft_id', synced.draft.id)
            .whereNull('booking_id')
            .update({
              is_booked: false,
              booking_draft_id: null,
              updated_at: DateTime.utc().toJSDate(),
            })
        }

        return {
          action: 'synced',
          bookingId: null,
          draftId: Number(synced.draft.id),
          paymentStatus,
        }
      })

      logBusinessEvent({ logger }, 'payment.webhook.processed', {
        paymentProvider: 'mollie',
        paymentId,
        action: result.action,
        draftId: result.draftId,
        bookingId: result.bookingId,
        paymentStatus: result.paymentStatus,
      })

      return response.ok(dataResponse({ received: true }))
    } catch (error) {
      if (error instanceof ApiHttpError) {
        logBusinessEvent(
          { logger },
          'payment.webhook.rejected',
          { paymentProvider: 'mollie', paymentId, code: error.payload.code },
          'warn'
        )
        return response.ok(dataResponse({ received: true }))
      }

      throw error
    }
  }

  async checkoutDraft({ auth, params, request, response, logger }: HttpContext) {
    const draftId = Number(params.draftId)
    const payload = await request.validateUsing(checkoutDraftValidator)
    const user = auth.getUserOrFail()

    if (!Number.isFinite(draftId) || draftId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'draftId invalide',
        })
      )
    }

    try {
      ensureMollieConfigured()
      const molliePayment = await withSpan(
        'payment.mollie.get',
        { 'payment.provider': 'mollie', 'payment.id': payload.paymentId },
        () => getMolliePayment(payload.paymentId)
      )
      const booking = await db.transaction(async (trx) => {
        const draft = (await trx
          .from('booking_drafts')
          .where('id', draftId)
          .where('customer_user_id', user.id)
          .forUpdate()
          .first()) as BookingDraftRow | null

        if (!draft) {
          throw new ApiHttpError(404, {
            code: 'BOOKING_DRAFT_NOT_FOUND',
            message: 'Draft de réservation introuvable',
          })
        }

        const synced = await this.syncPaymentFromMollie(trx, molliePayment, draft, payload.method)

        if (molliePayment.status !== 'paid') {
          await trx.from('booking_drafts').where('id', draft.id).update({
            status: 'payment_failed',
            updated_at: DateTime.utc().toJSDate(),
          })

          logBusinessEvent(
            { logger },
            'payment.checkout.not_confirmed',
            {
              userId: user.id,
              draftId,
              paymentProvider: 'mollie',
              paymentStatus: molliePayment.status,
            },
            'warn'
          )

          throw new ApiHttpError(409, {
            code: 'PAYMENT_NOT_CONFIRMED',
            message: 'Le paiement n’a pas été confirmé par le PSP.',
            details: { status: molliePayment.status },
          })
        }

        return this.completePaidDraft(trx, synced.draft, molliePayment, synced.method, user.id)
      })

      logBusinessEvent({ logger }, 'booking.checkout.succeeded', {
        userId: user.id,
        draftId,
        bookingId: Number(booking.booking.id),
        providerProfileId: Number(booking.booking.provider_profile_id),
        paymentProvider: 'mollie',
        paymentMethod: payload.method,
      })

      return response.ok(
        dataResponse(buildBookingDto(booking.booking as BookingRow, booking.payment))
      )
    } catch (error) {
      if (error instanceof ApiHttpError) {
        logBusinessEvent(
          { logger },
          'booking.checkout.rejected',
          { userId: user.id, draftId, code: error.payload.code },
          'warn'
        )
        return response.status(error.status).send(errorResponse(error.payload))
      }

      throw error
    }
  }

  async me({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const qs = request.qs()
    const page = parsePositiveInt(qs.page, 1, { min: 1, max: 100_000 })
    const limit = parsePositiveInt(qs.limit, 20, { min: 1, max: 100 })

    const countQuery = db.from('bookings').where('customer_user_id', user.id)
    if (qs.status) {
      countQuery.where('status', String(qs.status))
    }
    if (qs.from) {
      countQuery.where(
        'slot_start_at',
        '>=',
        DateTime.fromISO(String(qs.from), { zone: 'utc' }).toJSDate()
      )
    }
    if (qs.to) {
      countQuery.where(
        'slot_start_at',
        '<=',
        DateTime.fromISO(String(qs.to), { zone: 'utc' }).toJSDate()
      )
    }
    const totalResult = await countQuery.count('* as total').first()
    const total = Number(totalResult?.total ?? 0)

    const rows = (await db
      .from('bookings')
      .where('customer_user_id', user.id)
      .if(Boolean(qs.status), (queryBuilder) => queryBuilder.where('status', String(qs.status)))
      .if(Boolean(qs.from), (queryBuilder) =>
        queryBuilder.where(
          'slot_start_at',
          '>=',
          DateTime.fromISO(String(qs.from), { zone: 'utc' }).toJSDate()
        )
      )
      .if(Boolean(qs.to), (queryBuilder) =>
        queryBuilder.where(
          'slot_start_at',
          '<=',
          DateTime.fromISO(String(qs.to), { zone: 'utc' }).toJSDate()
        )
      )
      .orderBy('slot_start_at', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)) as BookingRow[]

    const payments = await db
      .from('payments')
      .whereIn(
        'booking_id',
        rows.map((row) => row.id)
      )
      .orderBy('created_at', 'desc')
      .select('booking_id', 'method', 'provider_transaction_id')

    const paymentByBooking = new Map<number, PaymentRow>()
    for (const payment of payments) {
      const bookingId = Number(payment.booking_id)
      if (!paymentByBooking.has(bookingId)) {
        paymentByBooking.set(bookingId, {
          method: payment.method ?? null,
          provider_transaction_id: payment.provider_transaction_id ?? null,
        })
      }
    }

    return response.ok(
      dataResponse(
        rows.map((booking) => buildBookingDto(booking, paymentByBooking.get(Number(booking.id)))),
        { meta: { page, limit, total } }
      )
    )
  }

  async show({ auth, params, response }: HttpContext) {
    const bookingId = Number(params.bookingId)
    const user = auth.getUserOrFail()

    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'bookingId invalide',
        })
      )
    }

    const booking = (await db
      .from('bookings')
      .where('id', bookingId)
      .where('customer_user_id', user.id)
      .first()) as BookingRow | null

    if (!booking) {
      return response.notFound(
        errorResponse({
          code: 'BOOKING_NOT_FOUND',
          message: 'Réservation introuvable',
        })
      )
    }

    const payment = await this.getBookingPayment(bookingId)
    return response.ok(dataResponse(buildBookingDto(booking, payment)))
  }

  async update({ auth, params, request, response }: HttpContext) {
    const bookingId = Number(params.bookingId)
    const payload = await request.validateUsing(updateBookingValidator)
    const user = auth.getUserOrFail()

    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'bookingId invalide',
        })
      )
    }

    try {
      const result = await db.transaction(async (trx) => {
        const booking = await trx
          .from('bookings')
          .where('id', bookingId)
          .where('customer_user_id', user.id)
          .forUpdate()
          .first()

        if (!booking) {
          throw new ApiHttpError(404, {
            code: 'BOOKING_NOT_FOUND',
            message: 'Réservation introuvable',
          })
        }

        if (booking.status !== 'paid') {
          throw new ApiHttpError(409, {
            code: 'BOOKING_NOT_MODIFIABLE',
            message: 'Cette réservation ne peut pas être modifiée.',
          })
        }

        ensureFutureBooking(booking.slot_start_at)

        const nextMode = (payload.appointmentMode ?? booking.appointment_mode) as
          | 'home'
          | 'institute'
        const nextAddress =
          payload.address === undefined
            ? (booking.address as string | null)
            : (payload.address ?? null)
        ensureAddressForHomeMode(nextMode, nextAddress)

        let nextSlotStartAt = booking.slot_start_at
        let nextSlotEndAt = booking.slot_end_at

        if (payload.slot) {
          const slotDate = DateTime.fromISO(payload.slot, { zone: 'utc' })
          if (!slotDate.isValid) {
            throw new ApiHttpError(400, {
              code: 'VALIDATION_ERROR',
              message: 'Le format du slot est invalide',
            })
          }

          const oldSlot = await trx
            .from('provider_availability_slots')
            .where('booking_id', booking.id)
            .forUpdate()
            .first()

          const newSlot = await trx
            .from('provider_availability_slots')
            .where('provider_profile_id', booking.provider_profile_id)
            .where('slot_start_at', slotDate.toJSDate())
            .forUpdate()
            .first()

          if (!newSlot || newSlot.is_booked) {
            throw new ApiHttpError(409, {
              code: 'BOOKING_SLOT_UNAVAILABLE',
              message: "Le créneau n'est plus disponible.",
            })
          }

          if (oldSlot) {
            await trx.from('provider_availability_slots').where('id', oldSlot.id).update({
              is_booked: false,
              booking_id: null,
              booking_draft_id: null,
              updated_at: DateTime.utc().toJSDate(),
            })
          }

          await trx.from('provider_availability_slots').where('id', newSlot.id).update({
            is_booked: true,
            booking_id: booking.id,
            booking_draft_id: null,
            updated_at: DateTime.utc().toJSDate(),
          })

          nextSlotStartAt = newSlot.slot_start_at
          nextSlotEndAt = newSlot.slot_end_at
        }

        await trx
          .from('bookings')
          .where('id', booking.id)
          .update({
            slot_start_at: nextSlotStartAt,
            slot_end_at: nextSlotEndAt,
            appointment_mode: nextMode,
            address: nextAddress,
            note: payload.note === undefined ? booking.note : payload.note,
            updated_at: DateTime.utc().toJSDate(),
          })

        const updatedBooking = await trx.from('bookings').where('id', booking.id).first()
        const payment = await trx
          .from('payments')
          .where('booking_id', booking.id)
          .orderBy('created_at', 'desc')
          .select('method', 'provider_transaction_id')
          .first()

        return { booking: updatedBooking as BookingRow, payment }
      })

      return response.ok(dataResponse(buildBookingDto(result.booking, result.payment)))
    } catch (error) {
      if (error instanceof ApiHttpError) {
        return response.status(error.status).send(errorResponse(error.payload))
      }

      throw error
    }
  }

  async cancel({ auth, params, response, logger }: HttpContext) {
    const bookingId = Number(params.bookingId)
    const user = auth.getUserOrFail()

    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'bookingId invalide',
        })
      )
    }

    try {
      const booking = await db
        .from('bookings')
        .where('id', bookingId)
        .where('customer_user_id', user.id)
        .first()

      if (!booking) {
        throw new ApiHttpError(404, {
          code: 'BOOKING_NOT_FOUND',
          message: 'Réservation introuvable',
        })
      }

      if (booking.status === 'cancelled') {
        throw new ApiHttpError(409, {
          code: 'BOOKING_ALREADY_CANCELLED',
          message: 'Cette réservation est déjà annulée.',
        })
      }

      const refundEligibility = getRefundEligibility(booking.slot_start_at)
      if (!refundEligibility.canCancel) {
        throw new ApiHttpError(409, {
          code: 'BOOKING_CANCEL_WINDOW_CLOSED',
          message: 'Ce rendez-vous ne peut plus être annulé depuis l’application.',
        })
      }

      const payment = await db
        .from('payments')
        .where('booking_id', booking.id)
        .orderBy('created_at', 'desc')
        .first()

      let refundId: string | null = null
      if (
        refundEligibility.refundEligible &&
        payment?.provider === 'mollie' &&
        payment.status === 'succeeded' &&
        payment.provider_transaction_id
      ) {
        ensureMollieConfigured()
        const refund = await withSpan(
          'payment.mollie.refund',
          {
            'payment.provider': 'mollie',
            'payment.id': payment.provider_transaction_id,
            'booking.id': Number(booking.id),
          },
          () =>
            createMollieRefund({
              paymentId: payment.provider_transaction_id,
              amountCents: Number(booking.amount_cents),
              currency: String(booking.currency ?? 'EUR'),
              description: `Remboursement Upper Glam réservation ${booking.id}`,
              metadata: {
                bookingId: String(booking.id),
                customerUserId: String(user.id),
              },
            })
        )

        refundId = refund.id
      }

      const cancelled = await db.transaction(async (trx) => {
        const lockedBooking = await trx
          .from('bookings')
          .where('id', bookingId)
          .where('customer_user_id', user.id)
          .forUpdate()
          .first()

        if (!lockedBooking) {
          throw new ApiHttpError(404, {
            code: 'BOOKING_NOT_FOUND',
            message: 'Réservation introuvable',
          })
        }

        if (lockedBooking.status === 'cancelled') {
          throw new ApiHttpError(409, {
            code: 'BOOKING_ALREADY_CANCELLED',
            message: 'Cette réservation est déjà annulée.',
          })
        }

        await trx.from('bookings').where('id', lockedBooking.id).update({
          status: 'cancelled',
          cancelled_at: DateTime.utc().toJSDate(),
          updated_at: DateTime.utc().toJSDate(),
        })

        await trx.from('provider_availability_slots').where('booking_id', lockedBooking.id).update({
          is_booked: false,
          booking_id: null,
          booking_draft_id: null,
          updated_at: DateTime.utc().toJSDate(),
        })

        if (refundId && payment) {
          await trx.from('payments').where('id', payment.id).update({
            status: 'refunded',
            refund_transaction_id: refundId,
            refunded_at: DateTime.utc().toJSDate(),
            updated_at: DateTime.utc().toJSDate(),
          })
        }

        return {
          id: Number(lockedBooking.id),
          refundEligible: refundEligibility.refundEligible,
          refundId,
        }
      })

      logBusinessEvent({ logger }, 'booking.cancelled', {
        userId: user.id,
        bookingId: cancelled.id,
        refundEligible: cancelled.refundEligible,
        refundCreated: Boolean(cancelled.refundId),
      })

      return response.ok(
        dataResponse({
          id: cancelled.id,
          status: 'cancelled',
          refundEligible: cancelled.refundEligible,
          refundTransactionId: cancelled.refundId,
        })
      )
    } catch (error) {
      if (error instanceof ApiHttpError) {
        return response.status(error.status).send(errorResponse(error.payload))
      }

      throw error
    }
  }
}
