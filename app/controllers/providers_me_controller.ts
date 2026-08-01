import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { dataResponse, errorResponse, parsePositiveInt } from '#services/http'
import { logBusinessEvent } from '#services/observability'
import { expireExpiredBookingDrafts } from '#services/booking_drafts'
import { getSignedUrlsByMediaIds } from '#services/media_assets'
import {
  createProviderAvailabilityClosureValidator,
  createProviderAvailabilityRuleValidator,
  createProviderAvailabilitySlotValidator,
  providerGalleryItemValidator,
  providerGalleryOrderValidator,
  providerBookingProposeSlotValidator,
  providerBookingRejectValidator,
  providerCustomerNoteValidator,
  providerServiceValidator,
  providerBookingStatusValidator,
  updateProviderProfileValidator,
} from '#validators/mobile'

type ProviderProfileRow = {
  id: number
  user_id: number
  display_name: string
  city: string
  bio: string | null
  institute_address: string | null
  service_modes: string[] | null
  home_service_zones: string[] | null
  price_from_cents: string | number | null
  currency: string
  rating_avg: string | number
  rating_count: number
}

type ProviderBookingStatus = 'pending' | 'accepted' | 'rejected' | 'slot_proposed'

function toIso(value: unknown) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(String(value))
  return date.toISOString()
}

function centsToNumber(value: unknown) {
  return value === null || value === undefined ? 0 : Number(value)
}

function toProviderProfileDto(row: ProviderProfileRow) {
  return {
    id: Number(row.id),
    displayName: row.display_name,
    city: row.city,
    bio: row.bio,
    instituteAddress: row.institute_address,
    serviceModes: Array.isArray(row.service_modes) ? row.service_modes : [],
    homeServiceZones: Array.isArray(row.home_service_zones) ? row.home_service_zones : [],
    priceFromCents: row.price_from_cents === null ? null : Number(row.price_from_cents),
    currency: row.currency ?? 'EUR',
    rating: Number(row.rating_avg ?? 0),
    reviewCount: Number(row.rating_count ?? 0),
  }
}

function toProviderBookingDto(booking: Record<string, unknown>) {
  return {
    id: Number(booking.id),
    slotStartAt: toIso(booking.slot_start_at),
    slotEndAt: toIso(booking.slot_end_at),
    appointmentMode: booking.appointment_mode,
    address: booking.address,
    note: booking.note,
    amountCents: Number(booking.amount_cents),
    currency: booking.currency,
    status: booking.status,
    providerStatus: booking.provider_status ?? 'pending',
    providerResponseNote: booking.provider_response_note ?? null,
    providerProposedSlotStartAt: toIso(booking.provider_proposed_slot_start_at),
    providerProposedSlotEndAt: toIso(booking.provider_proposed_slot_end_at),
    providerRespondedAt: toIso(booking.provider_responded_at),
    confirmationCode: booking.confirmation_code,
    customer: {
      firstName: booking.first_name ?? null,
      lastName: booking.last_name ?? null,
      email: booking.email ?? null,
    },
  }
}

function toProviderAvailabilityRuleDto(rule: Record<string, unknown>) {
  return {
    id: Number(rule.id),
    weekday: Number(rule.weekday),
    startTime: rule.start_time,
    endTime: rule.end_time,
    appointmentMode: rule.appointment_mode ?? null,
    isActive: Boolean(rule.is_active),
  }
}

function toProviderAvailabilityClosureDto(closure: Record<string, unknown>) {
  return {
    id: Number(closure.id),
    startsAt: toIso(closure.starts_at),
    endsAt: toIso(closure.ends_at),
    reason: closure.reason ?? null,
  }
}

function isValidTimeRange(startTime: string, endTime: string) {
  return startTime < endTime
}

function toProviderServiceDto(service: Record<string, unknown>) {
  return {
    id: Number(service.id),
    name: service.name,
    durationMinutes: Number(service.duration_minutes),
    priceCents: Number(service.price_cents),
    category: service.category,
    isActive: Boolean(service.is_active),
  }
}

function toProviderGalleryItemDto(item: Record<string, unknown>, imageUrl: string | null = null) {
  return {
    id: Number(item.id),
    mediaId: Number(item.media_id),
    imageUrl,
    title: item.title ?? null,
    position: Number(item.position),
  }
}

function escapeCsv(value: unknown) {
  const raw = value === null || value === undefined ? '' : String(value)
  return `"${raw.replace(/"/g, '""')}"`
}

export default class ProvidersMeController {
  private async getMyProviderProfile(userId: number) {
    return db
      .from('provider_profiles')
      .where('user_id', userId)
      .first() as Promise<ProviderProfileRow | null>
  }

  private forbidden(response: HttpContext['response']) {
    return response.forbidden(
      errorResponse({
        code: 'PROVIDER_FORBIDDEN',
        message: 'Accès prestataire requis.',
      })
    )
  }

  async dashboard({ auth, response }: HttpContext) {
    await expireExpiredBookingDrafts()
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const now = DateTime.utc()
    const startOfMonth = now.startOf('month').toJSDate()
    const endOfMonth = now.endOf('month').toJSDate()

    const [bookingStats, revenueStats, nextBookings, openSlotsResult] = await Promise.all([
      db
        .from('bookings')
        .where('provider_profile_id', provider.id)
        .select(
          db.raw(`count(*)::int as total_bookings`),
          db.raw(`count(*) filter (where status = 'paid')::int as paid_bookings`),
          db.raw(`count(*) filter (where status = 'cancelled')::int as cancelled_bookings`),
          db.raw(
            `count(*) filter (where status = 'paid' and slot_start_at >= now())::int as upcoming_bookings`
          )
        )
        .first(),
      db
        .from('bookings')
        .where('provider_profile_id', provider.id)
        .where('status', 'paid')
        .where('slot_start_at', '>=', startOfMonth)
        .where('slot_start_at', '<=', endOfMonth)
        .sum('amount_cents as amount_cents')
        .first(),
      db
        .from('bookings')
        .where('provider_profile_id', provider.id)
        .where('slot_start_at', '>=', now.toJSDate())
        .orderBy('slot_start_at', 'asc')
        .limit(3)
        .select(
          'id',
          'slot_start_at',
          'appointment_mode',
          'amount_cents',
          'currency',
          'status',
          'provider_status'
        ),
      db
        .from('provider_availability_slots')
        .where('provider_profile_id', provider.id)
        .where('is_booked', false)
        .where('slot_start_at', '>=', now.toJSDate())
        .count('* as total')
        .first(),
    ])

    return response.ok(
      dataResponse({
        provider: toProviderProfileDto(provider),
        stats: {
          totalBookings: Number(bookingStats?.total_bookings ?? 0),
          paidBookings: Number(bookingStats?.paid_bookings ?? 0),
          cancelledBookings: Number(bookingStats?.cancelled_bookings ?? 0),
          upcomingBookings: Number(bookingStats?.upcoming_bookings ?? 0),
          monthRevenueCents: centsToNumber(revenueStats?.amount_cents),
          openSlots: Number(openSlotsResult?.total ?? 0),
          rating: Number(provider.rating_avg ?? 0),
          reviewCount: Number(provider.rating_count ?? 0),
        },
        nextBookings: nextBookings.map((booking) => ({
          id: Number(booking.id),
          slot: toIso(booking.slot_start_at),
          appointmentMode: booking.appointment_mode,
          amountCents: Number(booking.amount_cents),
          currency: booking.currency,
          status: booking.status,
          providerStatus: booking.provider_status ?? 'pending',
        })),
      })
    )
  }

  async profile({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    return response.ok(dataResponse(toProviderProfileDto(provider)))
  }

  async updateProfile({ auth, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const payload = await request.validateUsing(updateProviderProfileValidator)
    await db
      .from('provider_profiles')
      .where('id', provider.id)
      .update({
        display_name: payload.displayName ?? provider.display_name,
        city: payload.city ?? provider.city,
        bio: payload.bio === undefined ? provider.bio : payload.bio,
        institute_address:
          payload.instituteAddress === undefined
            ? provider.institute_address
            : payload.instituteAddress,
        service_modes: payload.serviceModes ?? provider.service_modes ?? [],
        home_service_zones: payload.homeServiceZones ?? provider.home_service_zones ?? [],
        price_from_cents:
          payload.priceFromCents === undefined ? provider.price_from_cents : payload.priceFromCents,
        updated_at: DateTime.utc().toJSDate(),
      })

    const updatedProvider = await this.getMyProviderProfile(user.id)
    logBusinessEvent({ logger }, 'provider.profile.updated', {
      userId: user.id,
      providerProfileId: provider.id,
      updatedFields: Object.keys(payload).join(','),
    })
    return response.ok(dataResponse(toProviderProfileDto(updatedProvider!)))
  }

  async bookings({ auth, request, response }: HttpContext) {
    await expireExpiredBookingDrafts()
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const qs = request.qs()
    const page = parsePositiveInt(qs.page, 1, { min: 1, max: 100_000 })
    const limit = parsePositiveInt(qs.limit, 20, { min: 1, max: 100 })
    const status = qs.status ? String(qs.status) : null

    const countQuery = db.from('bookings').where('provider_profile_id', provider.id)
    if (status === 'paid' || status === 'cancelled') {
      countQuery.where('status', status)
    }
    const totalResult = await countQuery.count('* as total').first()

    const rows = await db
      .from('bookings as b')
      .leftJoin('user_profiles as up', 'up.user_id', 'b.customer_user_id')
      .leftJoin('users as u', 'u.id', 'b.customer_user_id')
      .where('b.provider_profile_id', provider.id)
      .if(status === 'paid' || status === 'cancelled', (query) => query.where('b.status', status!))
      .orderBy('b.slot_start_at', 'asc')
      .offset((page - 1) * limit)
      .limit(limit)
      .select(
        'b.id',
        'b.slot_start_at',
        'b.slot_end_at',
        'b.appointment_mode',
        'b.address',
        'b.note',
        'b.amount_cents',
        'b.currency',
        'b.status',
        'b.provider_status',
        'b.provider_response_note',
        'b.provider_proposed_slot_start_at',
        'b.provider_proposed_slot_end_at',
        'b.provider_responded_at',
        'b.confirmation_code',
        'up.first_name',
        'up.last_name',
        'u.email'
      )

    return response.ok(
      dataResponse(
        rows.map((booking) => toProviderBookingDto(booking)),
        { meta: { page, limit, total: Number(totalResult?.total ?? 0) } }
      )
    )
  }

  private async getOwnedBooking(providerProfileId: number, bookingId: number) {
    return db
      .from('bookings')
      .where('id', bookingId)
      .where('provider_profile_id', providerProfileId)
      .first()
  }

  private async respondToBooking({
    bookingId,
    logger,
    note,
    provider,
    response,
    status,
    userId,
  }: {
    bookingId: number
    logger: HttpContext['logger']
    note?: string | null
    provider: ProviderProfileRow
    response: HttpContext['response']
    status: ProviderBookingStatus
    userId: number
  }) {
    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'bookingId invalide',
        })
      )
    }

    const booking = await this.getOwnedBooking(provider.id, bookingId)
    if (!booking) {
      return response.notFound(
        errorResponse({
          code: 'BOOKING_NOT_FOUND',
          message: 'Réservation introuvable.',
        })
      )
    }

    if (booking.status !== 'paid') {
      return response.conflict(
        errorResponse({
          code: 'BOOKING_PROVIDER_STATUS_NOT_EDITABLE',
          message: 'Cette réservation ne peut pas être modifiée par le prestataire.',
        })
      )
    }

    const currentProviderStatus = (booking.provider_status ?? 'pending') as ProviderBookingStatus
    if (currentProviderStatus !== 'pending' && currentProviderStatus !== 'slot_proposed') {
      return response.conflict(
        errorResponse({
          code: 'BOOKING_PROVIDER_STATUS_ALREADY_SET',
          message: 'Cette réservation a déjà reçu une réponse prestataire.',
        })
      )
    }

    await db
      .from('bookings')
      .where('id', bookingId)
      .update({
        provider_status: status,
        provider_response_note: note ?? null,
        provider_responded_at: DateTime.utc().toJSDate(),
        updated_at: DateTime.utc().toJSDate(),
      })

    logBusinessEvent({ logger }, 'provider.booking.status_updated', {
      userId,
      providerProfileId: provider.id,
      bookingId,
      providerStatus: status,
    })

    return response.ok(
      dataResponse({
        id: bookingId,
        providerStatus: status,
      })
    )
  }

  async acceptBooking({ auth, params, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    return this.respondToBooking({
      bookingId: Number(params.bookingId),
      logger,
      provider,
      response,
      status: 'accepted',
      userId: user.id,
    })
  }

  async rejectBooking({ auth, params, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const payload = await request.validateUsing(providerBookingRejectValidator)
    return this.respondToBooking({
      bookingId: Number(params.bookingId),
      logger,
      note: payload.reason,
      provider,
      response,
      status: 'rejected',
      userId: user.id,
    })
  }

  async updateBookingStatus({ auth, params, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const payload = await request.validateUsing(providerBookingStatusValidator)
    return this.respondToBooking({
      bookingId: Number(params.bookingId),
      logger,
      note: payload.status === 'rejected' ? payload.reason : null,
      provider,
      response,
      status: payload.status,
      userId: user.id,
    })
  }

  async proposeBookingSlot({ auth, params, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const bookingId = Number(params.bookingId)
    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'bookingId invalide',
        })
      )
    }

    const payload = await request.validateUsing(providerBookingProposeSlotValidator)
    const startAt = DateTime.fromISO(payload.slotStartAt, { zone: 'utc' })
    const endAt = DateTime.fromISO(payload.slotEndAt, { zone: 'utc' })

    if (!startAt.isValid || !endAt.isValid || startAt >= endAt || startAt <= DateTime.utc()) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'Le créneau proposé est invalide.',
        })
      )
    }

    const booking = await this.getOwnedBooking(provider.id, bookingId)
    if (!booking) {
      return response.notFound(
        errorResponse({
          code: 'BOOKING_NOT_FOUND',
          message: 'Réservation introuvable.',
        })
      )
    }

    if (booking.status !== 'paid') {
      return response.conflict(
        errorResponse({
          code: 'BOOKING_PROVIDER_STATUS_NOT_EDITABLE',
          message: 'Cette réservation ne peut pas être modifiée par le prestataire.',
        })
      )
    }

    await db
      .from('bookings')
      .where('id', bookingId)
      .update({
        provider_status: 'slot_proposed',
        provider_response_note: payload.note ?? null,
        provider_proposed_slot_start_at: startAt.toJSDate(),
        provider_proposed_slot_end_at: endAt.toJSDate(),
        provider_responded_at: DateTime.utc().toJSDate(),
        updated_at: DateTime.utc().toJSDate(),
      })

    logBusinessEvent({ logger }, 'provider.booking.slot_proposed', {
      userId: user.id,
      providerProfileId: provider.id,
      bookingId,
    })

    return response.ok(
      dataResponse({
        id: bookingId,
        providerStatus: 'slot_proposed',
        providerProposedSlotStartAt: startAt.toISO(),
        providerProposedSlotEndAt: endAt.toISO(),
      })
    )
  }

  async availability({ auth, request, response }: HttpContext) {
    await expireExpiredBookingDrafts()
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const fromDate = request.input('from')
      ? DateTime.fromISO(String(request.input('from')), { zone: 'utc' })
      : DateTime.utc().startOf('day')
    const toDate = request.input('to')
      ? DateTime.fromISO(String(request.input('to')), { zone: 'utc' })
      : DateTime.utc().plus({ days: 30 }).endOf('day')

    if (!fromDate.isValid || !toDate.isValid || fromDate >= toDate) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'Paramètres from/to invalides',
        })
      )
    }

    const [slots, rules, closures] = await Promise.all([
      db
        .from('provider_availability_slots')
        .where('provider_profile_id', provider.id)
        .where('slot_start_at', '>=', fromDate.toJSDate())
        .where('slot_start_at', '<=', toDate.toJSDate())
        .orderBy('slot_start_at', 'asc')
        .select('id', 'slot_start_at', 'slot_end_at', 'is_booked', 'booking_id'),
      db
        .from('provider_availability_rules')
        .where('provider_profile_id', provider.id)
        .orderBy('weekday', 'asc')
        .orderBy('start_time', 'asc')
        .select('id', 'weekday', 'start_time', 'end_time', 'appointment_mode', 'is_active'),
      db
        .from('provider_availability_closures')
        .where('provider_profile_id', provider.id)
        .where('ends_at', '>=', fromDate.toJSDate())
        .where('starts_at', '<=', toDate.toJSDate())
        .orderBy('starts_at', 'asc')
        .select('id', 'starts_at', 'ends_at', 'reason'),
    ])

    return response.ok(
      dataResponse({
        slots: slots.map((slot) => ({
          id: Number(slot.id),
          slotStartAt: toIso(slot.slot_start_at),
          slotEndAt: toIso(slot.slot_end_at),
          isBooked: Boolean(slot.is_booked),
          bookingId: slot.booking_id ? Number(slot.booking_id) : null,
        })),
        rules: rules.map((rule) => toProviderAvailabilityRuleDto(rule)),
        closures: closures.map((closure) => toProviderAvailabilityClosureDto(closure)),
      })
    )
  }

  async createAvailability({ auth, request, response, logger }: HttpContext) {
    await expireExpiredBookingDrafts()
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const payload = await request.validateUsing(createProviderAvailabilitySlotValidator)
    const startAt = DateTime.fromISO(payload.slotStartAt, { zone: 'utc' })
    const endAt = DateTime.fromISO(payload.slotEndAt, { zone: 'utc' })

    if (!startAt.isValid || !endAt.isValid || startAt >= endAt) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'Le créneau est invalide.',
        })
      )
    }

    try {
      const [slot] = await db
        .table('provider_availability_slots')
        .insert({
          provider_profile_id: provider.id,
          slot_start_at: startAt.toJSDate(),
          slot_end_at: endAt.toJSDate(),
          is_booked: false,
        })
        .returning(['id', 'slot_start_at', 'slot_end_at', 'is_booked', 'booking_id'])

      logBusinessEvent({ logger }, 'provider.availability.created', {
        userId: user.id,
        providerProfileId: provider.id,
        slotId: Number(slot.id),
      })

      return response.created(
        dataResponse({
          id: Number(slot.id),
          slotStartAt: toIso(slot.slot_start_at),
          slotEndAt: toIso(slot.slot_end_at),
          isBooked: Boolean(slot.is_booked),
          bookingId: slot.booking_id ? Number(slot.booking_id) : null,
        })
      )
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        logBusinessEvent(
          { logger },
          'provider.availability.conflict',
          { userId: user.id, providerProfileId: provider.id },
          'warn'
        )
        return response.conflict(
          errorResponse({
            code: 'PROVIDER_SLOT_ALREADY_EXISTS',
            message: 'Ce créneau existe déjà.',
          })
        )
      }

      throw error
    }
  }

  async deleteAvailability({ auth, params, response, logger }: HttpContext) {
    await expireExpiredBookingDrafts()
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const slotId = Number(params.slotId)
    if (!Number.isFinite(slotId) || slotId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'slotId invalide',
        })
      )
    }

    const slot = await db
      .from('provider_availability_slots')
      .where('id', slotId)
      .where('provider_profile_id', provider.id)
      .first()

    if (!slot) {
      return response.notFound(
        errorResponse({
          code: 'PROVIDER_SLOT_NOT_FOUND',
          message: 'Créneau introuvable.',
        })
      )
    }

    if (slot.is_booked) {
      return response.conflict(
        errorResponse({
          code: 'PROVIDER_SLOT_BOOKED',
          message: 'Un créneau réservé ne peut pas être supprimé.',
        })
      )
    }

    await db.from('provider_availability_slots').where('id', slotId).delete()
    logBusinessEvent({ logger }, 'provider.availability.deleted', {
      userId: user.id,
      providerProfileId: provider.id,
      slotId,
    })
    return response.ok(dataResponse({ deleted: true }))
  }

  async availabilityRules({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const rules = await db
      .from('provider_availability_rules')
      .where('provider_profile_id', provider.id)
      .orderBy('weekday', 'asc')
      .orderBy('start_time', 'asc')
      .select('id', 'weekday', 'start_time', 'end_time', 'appointment_mode', 'is_active')

    return response.ok(dataResponse(rules.map((rule) => toProviderAvailabilityRuleDto(rule))))
  }

  async createAvailabilityRule({ auth, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const payload = await request.validateUsing(createProviderAvailabilityRuleValidator)
    if (!isValidTimeRange(payload.startTime, payload.endTime)) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: "L'horaire récurrent est invalide.",
        })
      )
    }

    try {
      const [rule] = await db
        .table('provider_availability_rules')
        .insert({
          provider_profile_id: provider.id,
          weekday: payload.weekday,
          start_time: payload.startTime,
          end_time: payload.endTime,
          appointment_mode: payload.appointmentMode ?? null,
          is_active: payload.isActive ?? true,
        })
        .returning(['id', 'weekday', 'start_time', 'end_time', 'appointment_mode', 'is_active'])

      logBusinessEvent({ logger }, 'provider.availability_rule.created', {
        userId: user.id,
        providerProfileId: provider.id,
        ruleId: Number(rule.id),
      })

      return response.created(dataResponse(toProviderAvailabilityRuleDto(rule)))
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        return response.conflict(
          errorResponse({
            code: 'PROVIDER_AVAILABILITY_RULE_ALREADY_EXISTS',
            message: 'Cette règle horaire existe déjà.',
          })
        )
      }

      throw error
    }
  }

  async deleteAvailabilityRule({ auth, params, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const ruleId = Number(params.ruleId)
    if (!Number.isFinite(ruleId) || ruleId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'ruleId invalide',
        })
      )
    }

    const deleted = await db
      .from('provider_availability_rules')
      .where('id', ruleId)
      .where('provider_profile_id', provider.id)
      .delete()

    if (!deleted) {
      return response.notFound(
        errorResponse({
          code: 'PROVIDER_AVAILABILITY_RULE_NOT_FOUND',
          message: 'Règle horaire introuvable.',
        })
      )
    }

    logBusinessEvent({ logger }, 'provider.availability_rule.deleted', {
      userId: user.id,
      providerProfileId: provider.id,
      ruleId,
    })

    return response.ok(dataResponse({ deleted: true }))
  }

  async availabilityClosures({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const fromDate = request.input('from')
      ? DateTime.fromISO(String(request.input('from')), { zone: 'utc' })
      : DateTime.utc().startOf('day')
    const toDate = request.input('to')
      ? DateTime.fromISO(String(request.input('to')), { zone: 'utc' })
      : DateTime.utc().plus({ days: 90 }).endOf('day')

    if (!fromDate.isValid || !toDate.isValid || fromDate >= toDate) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'Paramètres from/to invalides',
        })
      )
    }

    const closures = await db
      .from('provider_availability_closures')
      .where('provider_profile_id', provider.id)
      .where('ends_at', '>=', fromDate.toJSDate())
      .where('starts_at', '<=', toDate.toJSDate())
      .orderBy('starts_at', 'asc')
      .select('id', 'starts_at', 'ends_at', 'reason')

    return response.ok(
      dataResponse(closures.map((closure) => toProviderAvailabilityClosureDto(closure)))
    )
  }

  async createAvailabilityClosure({ auth, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const payload = await request.validateUsing(createProviderAvailabilityClosureValidator)
    const startsAt = DateTime.fromISO(payload.startsAt, { zone: 'utc' })
    const endsAt = DateTime.fromISO(payload.endsAt, { zone: 'utc' })

    if (!startsAt.isValid || !endsAt.isValid || startsAt >= endsAt) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'La fermeture est invalide.',
        })
      )
    }

    const [closure] = await db
      .table('provider_availability_closures')
      .insert({
        provider_profile_id: provider.id,
        starts_at: startsAt.toJSDate(),
        ends_at: endsAt.toJSDate(),
        reason: payload.reason ?? null,
      })
      .returning(['id', 'starts_at', 'ends_at', 'reason'])

    logBusinessEvent({ logger }, 'provider.availability_closure.created', {
      userId: user.id,
      providerProfileId: provider.id,
      closureId: Number(closure.id),
    })

    return response.created(dataResponse(toProviderAvailabilityClosureDto(closure)))
  }

  async deleteAvailabilityClosure({ auth, params, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const closureId = Number(params.closureId)
    if (!Number.isFinite(closureId) || closureId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'closureId invalide',
        })
      )
    }

    const deleted = await db
      .from('provider_availability_closures')
      .where('id', closureId)
      .where('provider_profile_id', provider.id)
      .delete()

    if (!deleted) {
      return response.notFound(
        errorResponse({
          code: 'PROVIDER_AVAILABILITY_CLOSURE_NOT_FOUND',
          message: 'Fermeture introuvable.',
        })
      )
    }

    logBusinessEvent({ logger }, 'provider.availability_closure.deleted', {
      userId: user.id,
      providerProfileId: provider.id,
      closureId,
    })

    return response.ok(dataResponse({ deleted: true }))
  }

  async services({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const services = await db
      .from('provider_services')
      .where('provider_profile_id', provider.id)
      .orderBy('category', 'asc')
      .orderBy('name', 'asc')
      .select('id', 'name', 'duration_minutes', 'price_cents', 'category', 'is_active')

    return response.ok(dataResponse(services.map((service) => toProviderServiceDto(service))))
  }

  async createService({ auth, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const payload = await request.validateUsing(providerServiceValidator)

    try {
      const [service] = await db
        .table('provider_services')
        .insert({
          provider_profile_id: provider.id,
          name: payload.name,
          duration_minutes: payload.durationMinutes,
          price_cents: payload.priceCents,
          category: payload.category,
          is_active: payload.isActive ?? true,
        })
        .returning(['id', 'name', 'duration_minutes', 'price_cents', 'category', 'is_active'])

      logBusinessEvent({ logger }, 'provider.service.created', {
        userId: user.id,
        providerProfileId: provider.id,
        serviceId: Number(service.id),
      })

      return response.created(dataResponse(toProviderServiceDto(service)))
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        return response.conflict(
          errorResponse({
            code: 'PROVIDER_SERVICE_ALREADY_EXISTS',
            message: 'Cette prestation existe déjà.',
          })
        )
      }

      throw error
    }
  }

  async updateService({ auth, params, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const serviceId = Number(params.serviceId)
    if (!Number.isFinite(serviceId) || serviceId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'serviceId invalide',
        })
      )
    }

    const payload = await request.validateUsing(providerServiceValidator)
    const [service] = await db
      .from('provider_services')
      .where('id', serviceId)
      .where('provider_profile_id', provider.id)
      .update({
        name: payload.name,
        duration_minutes: payload.durationMinutes,
        price_cents: payload.priceCents,
        category: payload.category,
        is_active: payload.isActive ?? true,
        updated_at: DateTime.utc().toJSDate(),
      })
      .returning(['id', 'name', 'duration_minutes', 'price_cents', 'category', 'is_active'])

    if (!service) {
      return response.notFound(
        errorResponse({
          code: 'PROVIDER_SERVICE_NOT_FOUND',
          message: 'Prestation introuvable.',
        })
      )
    }

    logBusinessEvent({ logger }, 'provider.service.updated', {
      userId: user.id,
      providerProfileId: provider.id,
      serviceId,
    })

    return response.ok(dataResponse(toProviderServiceDto(service)))
  }

  async deleteService({ auth, params, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const serviceId = Number(params.serviceId)
    if (!Number.isFinite(serviceId) || serviceId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'serviceId invalide',
        })
      )
    }

    const deleted = await db
      .from('provider_services')
      .where('id', serviceId)
      .where('provider_profile_id', provider.id)
      .delete()

    if (!deleted) {
      return response.notFound(
        errorResponse({
          code: 'PROVIDER_SERVICE_NOT_FOUND',
          message: 'Prestation introuvable.',
        })
      )
    }

    logBusinessEvent({ logger }, 'provider.service.deleted', {
      userId: user.id,
      providerProfileId: provider.id,
      serviceId,
    })

    return response.ok(dataResponse({ deleted: true }))
  }

  async gallery({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const items = await db
      .from('provider_gallery_items')
      .where('provider_profile_id', provider.id)
      .orderBy('position', 'asc')
      .select('id', 'media_id', 'title', 'position')
    const urlsByMediaId = await getSignedUrlsByMediaIds(items.map((item) => Number(item.media_id)))

    return response.ok(
      dataResponse(
        items.map((item) =>
          toProviderGalleryItemDto(item, urlsByMediaId.get(Number(item.media_id)) ?? null)
        )
      )
    )
  }

  async addGalleryItem({ auth, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const payload = await request.validateUsing(providerGalleryItemValidator)
    const media = await db
      .from('media_assets')
      .where('id', payload.mediaId)
      .where('owner_user_id', user.id)
      .first()

    if (!media) {
      return response.notFound(
        errorResponse({
          code: 'MEDIA_NOT_FOUND',
          message: 'Media introuvable.',
        })
      )
    }

    const maxPosition = await db
      .from('provider_gallery_items')
      .where('provider_profile_id', provider.id)
      .max('position as position')
      .first()
    const position =
      payload.position ??
      (maxPosition?.position === null ? 0 : Number(maxPosition?.position ?? -1) + 1)

    const [item] = await db
      .table('provider_gallery_items')
      .insert({
        provider_profile_id: provider.id,
        media_id: payload.mediaId,
        title: payload.title ?? null,
        position,
      })
      .returning(['id', 'media_id', 'title', 'position'])

    logBusinessEvent({ logger }, 'provider.gallery_item.created', {
      userId: user.id,
      providerProfileId: provider.id,
      galleryItemId: Number(item.id),
    })

    const urlsByMediaId = await getSignedUrlsByMediaIds([Number(item.media_id)])
    return response.created(
      dataResponse(toProviderGalleryItemDto(item, urlsByMediaId.get(Number(item.media_id)) ?? null))
    )
  }

  async reorderGallery({ auth, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const payload = await request.validateUsing(providerGalleryOrderValidator)
    const existingItems = await db
      .from('provider_gallery_items')
      .where('provider_profile_id', provider.id)
      .whereIn('id', payload.itemIds)
      .select('id')

    if (existingItems.length !== payload.itemIds.length) {
      return response.badRequest(
        errorResponse({
          code: 'PROVIDER_GALLERY_ORDER_INVALID',
          message: 'Ordre de galerie invalide.',
        })
      )
    }

    await db.transaction(async (trx) => {
      for (const [position, itemId] of payload.itemIds.entries()) {
        await trx
          .from('provider_gallery_items')
          .where('id', itemId)
          .where('provider_profile_id', provider.id)
          .update({ position })
      }
    })

    logBusinessEvent({ logger }, 'provider.gallery_item.reordered', {
      userId: user.id,
      providerProfileId: provider.id,
      itemCount: payload.itemIds.length,
    })

    return this.gallery({ auth, response } as HttpContext)
  }

  async deleteGalleryItem({ auth, params, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const itemId = Number(params.itemId)
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'itemId invalide',
        })
      )
    }

    const deleted = await db
      .from('provider_gallery_items')
      .where('id', itemId)
      .where('provider_profile_id', provider.id)
      .delete()

    if (!deleted) {
      return response.notFound(
        errorResponse({
          code: 'PROVIDER_GALLERY_ITEM_NOT_FOUND',
          message: 'Photo introuvable.',
        })
      )
    }

    logBusinessEvent({ logger }, 'provider.gallery_item.deleted', {
      userId: user.id,
      providerProfileId: provider.id,
      galleryItemId: itemId,
    })

    return response.ok(dataResponse({ deleted: true }))
  }

  async customers({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const rows = await db
      .from('bookings as b')
      .join('users as u', 'u.id', 'b.customer_user_id')
      .leftJoin('user_profiles as up', 'up.user_id', 'b.customer_user_id')
      .leftJoin('provider_customer_notes as pcn', (join) => {
        join
          .on('pcn.customer_user_id', 'b.customer_user_id')
          .andOnVal('pcn.provider_profile_id', provider.id)
      })
      .where('b.provider_profile_id', provider.id)
      .groupBy(
        'b.customer_user_id',
        'u.email',
        'up.first_name',
        'up.last_name',
        'pcn.note',
        'pcn.updated_at'
      )
      .orderByRaw('max(b.slot_start_at) desc')
      .select(
        'b.customer_user_id',
        'u.email',
        'up.first_name',
        'up.last_name',
        'pcn.note',
        'pcn.updated_at'
      )
      .count('* as booking_count')
      .max('b.slot_start_at as last_booking_at')
      .sum('b.amount_cents as total_amount_cents')

    return response.ok(
      dataResponse(
        rows.map((row) => ({
          customerUserId: Number(row.customer_user_id),
          firstName: row.first_name ?? null,
          lastName: row.last_name ?? null,
          email: row.email,
          bookingCount: Number(row.booking_count ?? 0),
          lastBookingAt: toIso(row.last_booking_at),
          totalAmountCents: centsToNumber(row.total_amount_cents),
          note: row.note ?? null,
          noteUpdatedAt: toIso(row.updated_at),
        }))
      )
    )
  }

  async updateCustomerNote({ auth, params, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const customerUserId = Number(params.customerUserId)
    if (!Number.isFinite(customerUserId) || customerUserId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'customerUserId invalide',
        })
      )
    }

    const customerBooking = await db
      .from('bookings')
      .where('provider_profile_id', provider.id)
      .where('customer_user_id', customerUserId)
      .first()
    if (!customerBooking) {
      return response.notFound(
        errorResponse({
          code: 'PROVIDER_CUSTOMER_NOT_FOUND',
          message: 'Client introuvable.',
        })
      )
    }

    const payload = await request.validateUsing(providerCustomerNoteValidator)
    const updatedAt = DateTime.utc().toJSDate()
    const updated = await db
      .from('provider_customer_notes')
      .where('provider_profile_id', provider.id)
      .where('customer_user_id', customerUserId)
      .update({
        note: payload.note,
        updated_at: updatedAt,
      })

    if (!updated) {
      await db.table('provider_customer_notes').insert({
        provider_profile_id: provider.id,
        customer_user_id: customerUserId,
        note: payload.note,
        updated_at: updatedAt,
      })
    }

    logBusinessEvent({ logger }, 'provider.customer_note.updated', {
      userId: user.id,
      providerProfileId: provider.id,
      customerUserId,
    })

    return response.ok(
      dataResponse({
        customerUserId,
        note: payload.note ?? null,
        noteUpdatedAt: toIso(updatedAt),
      })
    )
  }

  async exportCsv({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const type = String(request.input('type') ?? 'bookings')
    const rows = await db
      .from('bookings as b')
      .leftJoin('users as u', 'u.id', 'b.customer_user_id')
      .where('b.provider_profile_id', provider.id)
      .orderBy('b.slot_start_at', 'desc')
      .select(
        'b.id',
        'b.slot_start_at',
        'b.slot_end_at',
        'b.appointment_mode',
        'b.amount_cents',
        'b.currency',
        'b.status',
        'b.provider_status',
        'u.email'
      )

    const header =
      type === 'transactions'
        ? ['booking_id', 'date', 'customer_email', 'amount_cents', 'currency', 'status']
        : [
            'booking_id',
            'start_at',
            'end_at',
            'customer_email',
            'appointment_mode',
            'booking_status',
            'provider_status',
          ]
    const lines = [
      header.join(','),
      ...rows.map((row) =>
        type === 'transactions'
          ? [
              row.id,
              toIso(row.slot_start_at),
              row.email,
              row.amount_cents,
              row.currency,
              row.status,
            ]
              .map(escapeCsv)
              .join(',')
          : [
              row.id,
              toIso(row.slot_start_at),
              toIso(row.slot_end_at),
              row.email,
              row.appointment_mode,
              row.status,
              row.provider_status ?? 'pending',
            ]
              .map(escapeCsv)
              .join(',')
      ),
    ]

    response.header('Content-Type', 'text/csv; charset=utf-8')
    response.header('Content-Disposition', `attachment; filename="provider-${type}.csv"`)
    return response.send(lines.join('\n'))
  }

  async revenue({ auth, response }: HttpContext) {
    await expireExpiredBookingDrafts()
    const user = auth.getUserOrFail()
    const provider = await this.getMyProviderProfile(user.id)
    if (!provider) {
      return this.forbidden(response)
    }

    const now = DateTime.utc()
    const startOfMonth = now.startOf('month').toJSDate()
    const startOfYear = now.startOf('year').toJSDate()

    const [month, year, transactions, lifetime] = await Promise.all([
      db
        .from('bookings')
        .where('provider_profile_id', provider.id)
        .where('status', 'paid')
        .where('slot_start_at', '>=', startOfMonth)
        .sum('amount_cents as amount_cents')
        .count('* as total')
        .first(),
      db
        .from('bookings')
        .where('provider_profile_id', provider.id)
        .where('status', 'paid')
        .where('slot_start_at', '>=', startOfYear)
        .sum('amount_cents as amount_cents')
        .count('* as total')
        .first(),
      db
        .from('bookings')
        .where('provider_profile_id', provider.id)
        .orderBy('slot_start_at', 'desc')
        .limit(20)
        .select('id', 'slot_start_at', 'amount_cents', 'currency', 'status'),
      db
        .from('bookings')
        .where('provider_profile_id', provider.id)
        .where('status', 'paid')
        .sum('amount_cents as amount_cents')
        .count('* as total')
        .first(),
    ])

    return response.ok(
      dataResponse({
        currency: provider.currency ?? 'EUR',
        month: {
          amountCents: centsToNumber(month?.amount_cents),
          bookingCount: Number(month?.total ?? 0),
        },
        year: {
          amountCents: centsToNumber(year?.amount_cents),
          bookingCount: Number(year?.total ?? 0),
        },
        payouts: {
          status: 'manual_review',
          paidOutCents: 0,
          pendingCents: centsToNumber(lifetime?.amount_cents),
          bookingCount: Number(lifetime?.total ?? 0),
        },
        transactions: transactions.map((transaction) => ({
          bookingId: Number(transaction.id),
          slot: toIso(transaction.slot_start_at),
          amountCents: Number(transaction.amount_cents),
          currency: transaction.currency,
          status: transaction.status,
        })),
      })
    )
  }
}
