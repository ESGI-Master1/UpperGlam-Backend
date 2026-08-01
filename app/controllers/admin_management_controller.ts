import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { recordAdminAuditEvent } from '#services/admin_audit'
import { dataResponse, errorResponse, parsePositiveInt } from '#services/http'

type AccountStatus = 'active' | 'pending' | 'suspended'

const toIso = (value: Date | string | null | undefined) =>
  value ? (value instanceof Date ? value.toISOString() : new Date(value).toISOString()) : null

function parseStatus(value: unknown): AccountStatus | null {
  return value === 'active' || value === 'pending' || value === 'suspended' ? value : null
}

function pagination(request: HttpContext['request']) {
  const qs = request.qs()
  return {
    limit: parsePositiveInt(qs.limit, 20, { min: 1, max: 100 }),
    page: parsePositiveInt(qs.page, 1, { min: 1, max: 100_000 }),
    search: qs.search ? String(qs.search).trim() : '',
    status: qs.status ? String(qs.status) : '',
  }
}

export default class AdminManagementController {
  async dashboard({ response }: HttpContext) {
    const [users, providers, pending, bookings, revenue, recent] = await Promise.all([
      db
        .from('users as u')
        .whereExists((query) =>
          query
            .from('user_roles as ur')
            .join('roles as r', 'r.id', 'ur.role_id')
            .whereRaw('ur.user_id = u.id')
            .where('r.name', 'user')
        )
        .countDistinct('u.id as total')
        .first(),
      db.from('provider_profiles').count('* as total').first(),
      db
        .from('pre_registrations')
        .whereIn('review_status', ['submitted', 'in_review'])
        .count('* as total')
        .first(),
      db
        .from('bookings')
        .select(
          db.raw('count(*)::int as total'),
          db.raw("count(*) filter (where status = 'paid')::int as paid"),
          db.raw("count(*) filter (where status = 'cancelled')::int as cancelled")
        )
        .first(),
      db
        .from('payments')
        .join('bookings as b', 'b.id', 'payments.booking_id')
        .where('payments.status', 'succeeded')
        .sum('b.amount_cents as total')
        .first(),
      db
        .from('users as u')
        .leftJoin('user_profiles as up', 'up.user_id', 'u.id')
        .whereExists((query) =>
          query
            .from('user_roles as ur')
            .join('roles as r', 'r.id', 'ur.role_id')
            .whereRaw('ur.user_id = u.id')
            .whereIn('r.name', ['user', 'provider'])
        )
        .select('u.id', 'u.email', 'u.status', 'up.first_name', 'up.last_name', 'u.created_at')
        .orderBy('u.created_at', 'desc')
        .limit(6),
    ])

    return response.ok(
      dataResponse({
        bookings: {
          cancelled: Number(bookings?.cancelled ?? 0),
          paid: Number(bookings?.paid ?? 0),
          total: Number(bookings?.total ?? 0),
        },
        pendingPreRegistrations: Number(pending?.total ?? 0),
        providers: Number(providers?.total ?? 0),
        revenueCents: Number(revenue?.total ?? 0),
        users: Number(users?.total ?? 0),
        recentRegistrations: recent.map((row) => ({
          createdAt: toIso(row.created_at),
          email: row.email,
          firstName: row.first_name,
          id: Number(row.id),
          lastName: row.last_name,
          status: row.status,
        })),
      })
    )
  }

  async users({ request, response }: HttpContext) {
    const { limit, page, search, status } = pagination(request)
    const base = () =>
      db
        .from('users as u')
        .leftJoin('user_profiles as up', 'up.user_id', 'u.id')
        .whereExists((query) =>
          query
            .from('user_roles as ur')
            .join('roles as r', 'r.id', 'ur.role_id')
            .whereRaw('ur.user_id = u.id')
            .where('r.name', 'user')
        )
    const applyFilters = (query: ReturnType<typeof base>) => {
      if (status) query.where('u.status', status)
      if (search)
        query.where((builder) =>
          builder
            .whereILike('u.email', `%${search}%`)
            .orWhereILike('u.phone', `%${search}%`)
            .orWhereILike('up.first_name', `%${search}%`)
            .orWhereILike('up.last_name', `%${search}%`)
        )
    }
    const countQuery = base()
    applyFilters(countQuery)
    const totalRow = await countQuery.countDistinct('u.id as total').first()
    const rowsQuery = base()
    applyFilters(rowsQuery)
    const rows = await rowsQuery
      .select(
        'u.id',
        'u.email',
        'u.phone',
        'u.status',
        'u.created_at',
        'up.first_name',
        'up.last_name',
        db.raw(
          '(select count(*)::int from bookings b where b.customer_user_id = u.id) as bookings_count'
        ),
        db.raw(
          "(select coalesce(sum(b.amount_cents), 0) from bookings b where b.customer_user_id = u.id and b.status = 'paid') as spent_cents"
        ),
        db.raw(
          '(select count(*)::int from provider_reviews pr where pr.author_user_id = u.id) as reviews_count'
        )
      )
      .orderBy('u.created_at', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)

    return response.ok(
      dataResponse(
        rows.map((row) => ({
          bookingsCount: Number(row.bookings_count ?? 0),
          createdAt: toIso(row.created_at),
          email: row.email,
          firstName: row.first_name,
          id: Number(row.id),
          lastName: row.last_name,
          phone: row.phone,
          reviewsCount: Number(row.reviews_count ?? 0),
          spentCents: Number(row.spent_cents ?? 0),
          status: row.status,
        })),
        { meta: { limit, page, total: Number(totalRow?.total ?? 0) } }
      )
    )
  }

  async providers({ request, response }: HttpContext) {
    const { limit, page, search, status } = pagination(request)
    const featured = request.qs().featured
    const base = () =>
      db
        .from('provider_profiles as pp')
        .join('users as u', 'u.id', 'pp.user_id')
        .leftJoin('user_profiles as up', 'up.user_id', 'u.id')
    const applyFilters = (query: ReturnType<typeof base>) => {
      if (status) query.where('u.status', status)
      if (featured === 'true' || featured === 'false')
        query.where('pp.is_featured', featured === 'true')
      if (search)
        query.where((builder) =>
          builder
            .whereILike('pp.display_name', `%${search}%`)
            .orWhereILike('pp.city', `%${search}%`)
            .orWhereILike('u.email', `%${search}%`)
        )
    }
    const countQuery = base()
    applyFilters(countQuery)
    const totalRow = await countQuery.countDistinct('pp.id as total').first()
    const rowsQuery = base()
    applyFilters(rowsQuery)
    const rows = await rowsQuery
      .select(
        'pp.id',
        'pp.user_id',
        'pp.display_name',
        'pp.city',
        'pp.bio',
        'pp.institute_address',
        'pp.service_modes',
        'pp.price_from_cents',
        'pp.currency',
        'pp.is_featured',
        'pp.rating_avg',
        'pp.rating_count',
        'pp.created_at',
        'u.email',
        'u.phone',
        'u.status',
        'up.first_name',
        'up.last_name',
        db.raw(
          '(select count(*)::int from provider_services ps where ps.provider_profile_id = pp.id and ps.is_active = true) as services_count'
        ),
        db.raw(
          '(select count(*)::int from bookings b where b.provider_profile_id = pp.id) as bookings_count'
        ),
        db.raw(
          "(select coalesce(sum(b.amount_cents), 0) from bookings b where b.provider_profile_id = pp.id and b.status = 'paid') as revenue_cents"
        )
      )
      .orderBy('pp.created_at', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)

    return response.ok(
      dataResponse(
        rows.map((row) => ({
          bio: row.bio,
          bookingsCount: Number(row.bookings_count ?? 0),
          city: row.city,
          createdAt: toIso(row.created_at),
          currency: row.currency,
          displayName: row.display_name,
          email: row.email,
          firstName: row.first_name,
          id: Number(row.id),
          instituteAddress: row.institute_address,
          isFeatured: Boolean(row.is_featured),
          lastName: row.last_name,
          phone: row.phone,
          priceFromCents: row.price_from_cents === null ? null : Number(row.price_from_cents),
          ratingAvg: Number(row.rating_avg ?? 0),
          ratingCount: Number(row.rating_count ?? 0),
          revenueCents: Number(row.revenue_cents ?? 0),
          serviceModes: row.service_modes ?? [],
          servicesCount: Number(row.services_count ?? 0),
          status: row.status,
          userId: Number(row.user_id),
        })),
        { meta: { limit, page, total: Number(totalRow?.total ?? 0) } }
      )
    )
  }

  async updateUserStatus({ auth, params, request, response }: HttpContext) {
    const userId = Number(params.userId)
    const status = parseStatus(request.input('status'))
    if (!Number.isFinite(userId) || userId <= 0 || !status)
      return response.badRequest(
        errorResponse({ code: 'VALIDATION_ERROR', message: 'Statut ou utilisateur invalide.' })
      )
    const admin = auth.getUserOrFail()
    if (admin.id === userId)
      return response.conflict(
        errorResponse({
          code: 'ADMIN_SELF_UPDATE_FORBIDDEN',
          message: 'Vous ne pouvez pas modifier votre propre statut.',
        })
      )
    const target = await db.from('users').where('id', userId).select('id', 'status').first()
    if (!target)
      return response.notFound(
        errorResponse({ code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' })
      )
    await db.transaction(async (trx) => {
      await trx.from('users').where('id', userId).update({ status })
      await recordAdminAuditEvent(
        {
          action: 'admin.user.status_updated',
          adminUserId: admin.id,
          details: { previousStatus: target.status, status, targetUserId: userId },
        },
        trx
      )
    })
    return response.ok(
      dataResponse(
        { id: userId, status, updatedAt: DateTime.utc().toISO() },
        { message: 'Statut du compte mis à jour.' }
      )
    )
  }

  async updateProvider({ auth, params, request, response }: HttpContext) {
    const providerId = Number(params.providerId)
    const statusValue = request.input('status')
    const featuredValue = request.input('isFeatured')
    const status = statusValue === undefined ? undefined : parseStatus(statusValue)
    const isFeatured = featuredValue === undefined ? undefined : featuredValue
    if (
      !Number.isFinite(providerId) ||
      providerId <= 0 ||
      status === null ||
      (isFeatured !== undefined && typeof isFeatured !== 'boolean') ||
      (status === undefined && isFeatured === undefined)
    )
      return response.badRequest(
        errorResponse({ code: 'VALIDATION_ERROR', message: 'Modification prestataire invalide.' })
      )
    const target = await db
      .from('provider_profiles as pp')
      .join('users as u', 'u.id', 'pp.user_id')
      .where('pp.id', providerId)
      .select('pp.id', 'pp.user_id', 'pp.is_featured', 'u.status')
      .first()
    if (!target)
      return response.notFound(
        errorResponse({ code: 'PROVIDER_NOT_FOUND', message: 'Prestataire introuvable.' })
      )
    const admin = auth.getUserOrFail()
    await db.transaction(async (trx) => {
      if (status !== undefined)
        await trx.from('users').where('id', target.user_id).update({ status })
      if (isFeatured !== undefined)
        await trx
          .from('provider_profiles')
          .where('id', providerId)
          .update({ is_featured: isFeatured, updated_at: DateTime.utc().toJSDate() })
      await recordAdminAuditEvent(
        {
          action: 'admin.provider.updated',
          adminUserId: admin.id,
          details: {
            isFeatured: isFeatured ?? Boolean(target.is_featured),
            previousIsFeatured: Boolean(target.is_featured),
            previousStatus: target.status,
            providerId,
            status: status ?? target.status,
            targetUserId: Number(target.user_id),
          },
        },
        trx
      )
    })
    return response.ok(
      dataResponse(
        {
          id: providerId,
          isFeatured: isFeatured ?? Boolean(target.is_featured),
          status: status ?? target.status,
        },
        { message: 'Prestataire mis à jour.' }
      )
    )
  }
}
