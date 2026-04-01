import { randomUUID } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { ApiHttpError, dataResponse, errorResponse, parsePositiveInt } from '#services/http'
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
  appointment_mode: 'home' | 'institute'
  address: string | null
  note: string | null
  amount_cents: string | number
  currency: string
  created_at: Date
  status: 'paid' | 'cancelled'
  confirmation_code: string
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

function buildBookingDto(
  booking: BookingRow,
  payment?: { method?: string | null; provider_transaction_id?: string | null } | null
) {
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

export default class BookingsController {
  private async getBookingPayment(bookingId: number) {
    return db
      .from('payments')
      .where('booking_id', bookingId)
      .orderBy('created_at', 'desc')
      .select('method', 'provider_transaction_id')
      .first()
  }

  async createDraft({ auth, request, response }: HttpContext) {
    const payload = await request.validateUsing(createBookingDraftValidator)
    ensureAddressForHomeMode(payload.appointmentMode, payload.address ?? null)

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

    const slot = await db
      .from('provider_availability_slots')
      .where('provider_profile_id', payload.providerId)
      .where('slot_start_at', slotDate.toJSDate())
      .where('is_booked', false)
      .first()

    if (!slot) {
      return response.conflict(
        errorResponse({
          code: 'BOOKING_SLOT_UNAVAILABLE',
          message: "Le créneau n'est plus disponible.",
          details: { slot: payload.slot },
        })
      )
    }

    const [draft] = await db
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

  async checkoutDraft({ auth, params, request, response }: HttpContext) {
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
      const booking = await db.transaction(async (trx) => {
        const draft = await trx
          .from('booking_drafts')
          .where('id', draftId)
          .where('customer_user_id', user.id)
          .forUpdate()
          .first()

        if (!draft) {
          throw new ApiHttpError(404, {
            code: 'BOOKING_DRAFT_NOT_FOUND',
            message: 'Draft de réservation introuvable',
          })
        }

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
          await trx.from('booking_drafts').where('id', draft.id).update({
            status: 'expired',
            updated_at: DateTime.utc().toJSDate(),
          })

          throw new ApiHttpError(409, {
            code: 'BOOKING_DRAFT_EXPIRED',
            message: 'Le draft de réservation a expiré.',
          })
        }

        const slot = await trx
          .from('provider_availability_slots')
          .where('provider_profile_id', draft.provider_profile_id)
          .where('slot_start_at', draft.slot_start_at)
          .forUpdate()
          .first()

        if (!slot || slot.is_booked) {
          await trx.from('booking_drafts').where('id', draft.id).update({
            status: 'payment_failed',
            updated_at: DateTime.utc().toJSDate(),
          })

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
            customer_user_id: user.id,
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

        const transactionId = `txn_${randomUUID().replace(/-/g, '').slice(0, 18)}`
        await trx.table('payments').insert({
          booking_draft_id: draft.id,
          booking_id: createdBooking.id,
          method: payload.method,
          provider: 'wallet',
          provider_transaction_id: transactionId,
          provider_reference: payload.platformPayToken.slice(0, 64),
          status: 'succeeded',
        })

        await trx.from('provider_availability_slots').where('id', slot.id).update({
          is_booked: true,
          booking_id: createdBooking.id,
          updated_at: DateTime.utc().toJSDate(),
        })

        await trx.from('booking_drafts').where('id', draft.id).update({
          status: 'completed',
          updated_at: DateTime.utc().toJSDate(),
        })

        return {
          booking: createdBooking,
          payment: {
            method: payload.method,
            provider_transaction_id: transactionId,
          },
        }
      })

      return response.ok(
        dataResponse(buildBookingDto(booking.booking as BookingRow, booking.payment))
      )
    } catch (error) {
      if (error instanceof ApiHttpError) {
        return response.status(error.status).send(errorResponse(error.payload))
      }

      throw error
    }
  }

  async createPaymentIntent({ auth, request, response }: HttpContext) {
    const payload = await request.validateUsing(paymentIntentValidator)
    const user = auth.getUserOrFail()

    const draft = await db
      .from('booking_drafts')
      .where('id', payload.draftId)
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

    const transactionId = `txn_${randomUUID().replace(/-/g, '').slice(0, 18)}`
    const providerReference = payload.platformPayToken.slice(0, 64)

    await db.table('payments').insert({
      booking_draft_id: draft.id,
      method: payload.method,
      provider: 'wallet',
      provider_transaction_id: transactionId,
      provider_reference: providerReference,
      status: 'succeeded',
    })

    return response.ok(
      dataResponse({
        status: 'succeeded',
        transactionId,
        providerReference,
      })
    )
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

    const paymentByBooking = new Map<
      number,
      { method: string | null; provider_transaction_id: string | null }
    >()
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
              updated_at: DateTime.utc().toJSDate(),
            })
          }

          await trx.from('provider_availability_slots').where('id', newSlot.id).update({
            is_booked: true,
            booking_id: booking.id,
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

  async cancel({ auth, params, response }: HttpContext) {
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
      const cancelled = await db.transaction(async (trx) => {
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

        if (booking.status === 'cancelled') {
          throw new ApiHttpError(409, {
            code: 'BOOKING_ALREADY_CANCELLED',
            message: 'Cette réservation est déjà annulée.',
          })
        }

        await trx.from('bookings').where('id', booking.id).update({
          status: 'cancelled',
          cancelled_at: DateTime.utc().toJSDate(),
          updated_at: DateTime.utc().toJSDate(),
        })

        await trx.from('provider_availability_slots').where('booking_id', booking.id).update({
          is_booked: false,
          booking_id: null,
          updated_at: DateTime.utc().toJSDate(),
        })

        return Number(booking.id)
      })

      return response.ok(
        dataResponse({
          id: cancelled,
          status: 'cancelled',
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
