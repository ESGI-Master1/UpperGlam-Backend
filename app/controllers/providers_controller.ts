import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { dataResponse, errorResponse, parsePositiveInt } from '#services/http'
import { getSignedUrlsByMediaIds } from '#services/media_assets'
import { expireExpiredBookingDrafts } from '#services/booking_drafts'

type ProviderRow = {
  id: number
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
  cover_media_id: number | null
  avatar_media_id: number | null
}

function toIso(value: unknown) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(String(value))
  return date.toISOString()
}

function parseTagsInput(rawTags: unknown) {
  if (!rawTags) {
    return []
  }

  if (Array.isArray(rawTags)) {
    return rawTags.map((value) => String(value).trim()).filter(Boolean)
  }

  return String(rawTags)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function toAuthorName(input: { first_name: string | null; last_name: string | null }) {
  if (input.first_name && input.last_name) {
    return `${input.first_name} ${input.last_name.slice(0, 1)}.`
  }

  if (input.first_name) {
    return input.first_name
  }

  return 'Utilisateur'
}

export default class ProvidersController {
  private applyProviderFilters(
    query: ReturnType<typeof db.from>,
    filters: {
      search?: string
      location?: string
      tags?: string[]
      serviceMode?: string
      date?: string
    }
  ) {
    if (filters.search) {
      query.where((builder) => {
        builder
          .whereILike('pp.display_name', `%${filters.search}%`)
          .orWhereILike('pp.bio', `%${filters.search}%`)
      })
    }

    if (filters.location) {
      query.whereILike('pp.city', `%${filters.location}%`)
    }

    if (filters.serviceMode) {
      query.whereRaw('pp.service_modes ? ?', [filters.serviceMode])
    }

    if (filters.tags && filters.tags.length) {
      query
        .join('provider_profile_tags as ppt', 'ppt.provider_profile_id', 'pp.id')
        .join('provider_tags as pt', 'pt.id', 'ppt.provider_tag_id')
        .whereIn('pt.slug', filters.tags)
    }

    if (filters.date) {
      query.whereExists((builder) => {
        builder
          .select(db.raw('1'))
          .from('provider_availability_slots as pas')
          .whereRaw('pas.provider_profile_id = pp.id')
          .whereRaw('DATE(pas.slot_start_at) = ?', [String(filters.date)])
          .where('pas.is_booked', false)
      })
    }
  }

  private async mapProviders(rows: ProviderRow[]) {
    if (!rows.length) {
      return []
    }

    const providerIds = rows.map((row) => Number(row.id))
    const mediaIds = rows
      .flatMap((row) => [row.cover_media_id, row.avatar_media_id])
      .filter((value): value is number => Number.isFinite(Number(value)))
      .map((value) => Number(value))

    const [tagRows, slotRows, signedUrlsByMediaId] = await Promise.all([
      db
        .from('provider_profile_tags as ppt')
        .join('provider_tags as pt', 'pt.id', 'ppt.provider_tag_id')
        .whereIn('ppt.provider_profile_id', providerIds)
        .select('ppt.provider_profile_id', 'pt.slug'),
      db
        .from('provider_availability_slots')
        .whereIn('provider_profile_id', providerIds)
        .where('is_booked', false)
        .where('slot_start_at', '>=', DateTime.utc().toJSDate())
        .orderBy('slot_start_at', 'asc')
        .select('provider_profile_id', 'slot_start_at'),
      getSignedUrlsByMediaIds(mediaIds),
    ])

    const tagsByProvider = new Map<number, string[]>()
    for (const row of tagRows) {
      const providerId = Number(row.provider_profile_id)
      const current = tagsByProvider.get(providerId) ?? []
      current.push(String(row.slug))
      tagsByProvider.set(providerId, current)
    }

    const slotsByProvider = new Map<number, string[]>()
    for (const row of slotRows) {
      const providerId = Number(row.provider_profile_id)
      const current = slotsByProvider.get(providerId) ?? []
      if (current.length < 3) {
        current.push(toIso(row.slot_start_at)!)
      }
      slotsByProvider.set(providerId, current)
    }

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.display_name,
      city: row.city,
      bio: row.bio,
      coverImageUrl: row.cover_media_id
        ? (signedUrlsByMediaId.get(Number(row.cover_media_id)) ?? null)
        : null,
      avatarImageUrl: row.avatar_media_id
        ? (signedUrlsByMediaId.get(Number(row.avatar_media_id)) ?? null)
        : null,
      rating: Number(row.rating_avg ?? 0),
      reviewCount: Number(row.rating_count ?? 0),
      priceFromCents: row.price_from_cents === null ? null : Number(row.price_from_cents),
      currency: row.currency ?? 'EUR',
      serviceModes: Array.isArray(row.service_modes) ? row.service_modes : [],
      homeServiceZones: Array.isArray(row.home_service_zones) ? row.home_service_zones : [],
      instituteAddress: row.institute_address,
      tags: tagsByProvider.get(Number(row.id)) ?? [],
      nextSlots: slotsByProvider.get(Number(row.id)) ?? [],
    }))
  }

  async tags({ response }: HttpContext) {
    const rows = await db.from('provider_tags').orderBy('slug', 'asc').select('slug')
    return response.ok(dataResponse(rows.map((row) => String(row.slug))))
  }

  async featured({ request, response }: HttpContext) {
    await expireExpiredBookingDrafts()
    const limit = parsePositiveInt(request.input('limit'), 4, { min: 1, max: 20 })
    const rows = (await db
      .from('provider_profiles as pp')
      .where('pp.is_featured', true)
      .orderBy('pp.rating_avg', 'desc')
      .limit(limit)
      .select(
        'pp.id',
        'pp.display_name',
        'pp.city',
        'pp.bio',
        'pp.institute_address',
        'pp.service_modes',
        'pp.home_service_zones',
        'pp.price_from_cents',
        'pp.currency',
        'pp.rating_avg',
        'pp.rating_count',
        'pp.cover_media_id',
        'pp.avatar_media_id'
      )) as ProviderRow[]

    const providers = await this.mapProviders(rows)
    return response.ok(dataResponse(providers))
  }

  async index({ request, response }: HttpContext) {
    await expireExpiredBookingDrafts()
    const qs = request.qs()
    const page = parsePositiveInt(qs.page, 1, { min: 1, max: 100_000 })
    const limit = parsePositiveInt(qs.limit, 20, { min: 1, max: 100 })
    const sortByRaw = String(qs.sortBy ?? 'rating')
    const sortOrder = String(qs.sortOrder ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc'
    const sortColumnByKey: Record<string, string> = {
      rating: 'pp.rating_avg',
      price: 'pp.price_from_cents',
      reviewCount: 'pp.rating_count',
    }

    const filters = {
      search: qs.query ? String(qs.query).trim() : undefined,
      location: qs.location ? String(qs.location).trim() : undefined,
      tags: parseTagsInput(qs.tags),
      serviceMode: qs.serviceMode ? String(qs.serviceMode) : undefined,
      date: qs.date ? String(qs.date) : undefined,
    }

    const countQuery = db.from('provider_profiles as pp')
    this.applyProviderFilters(countQuery, filters)
    const totalResult = await countQuery.countDistinct('pp.id as total').first()
    const total = Number(totalResult?.total ?? 0)

    const rowsQuery = db.from('provider_profiles as pp')
    this.applyProviderFilters(rowsQuery, filters)
    const rows = (await rowsQuery
      .distinct(
        'pp.id',
        'pp.display_name',
        'pp.city',
        'pp.bio',
        'pp.institute_address',
        'pp.service_modes',
        'pp.home_service_zones',
        'pp.price_from_cents',
        'pp.currency',
        'pp.rating_avg',
        'pp.rating_count',
        'pp.cover_media_id',
        'pp.avatar_media_id'
      )
      .orderBy(sortColumnByKey[sortByRaw] ?? 'pp.rating_avg', sortOrder)
      .offset((page - 1) * limit)
      .limit(limit)) as ProviderRow[]

    const data = await this.mapProviders(rows)
    return response.ok(dataResponse(data, { meta: { page, limit, total } }))
  }

  async show({ params, response }: HttpContext) {
    await expireExpiredBookingDrafts()
    const providerId = Number(params.providerId)
    if (!Number.isFinite(providerId) || providerId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'providerId invalide',
          details: { providerId: params.providerId },
        })
      )
    }

    const row = (await db
      .from('provider_profiles as pp')
      .where('pp.id', providerId)
      .select(
        'pp.id',
        'pp.display_name',
        'pp.city',
        'pp.bio',
        'pp.institute_address',
        'pp.service_modes',
        'pp.home_service_zones',
        'pp.price_from_cents',
        'pp.currency',
        'pp.rating_avg',
        'pp.rating_count',
        'pp.cover_media_id',
        'pp.avatar_media_id'
      )
      .first()) as ProviderRow | null

    if (!row) {
      return response.notFound(
        errorResponse({
          code: 'PROVIDER_NOT_FOUND',
          message: 'Prestataire introuvable',
        })
      )
    }

    const [providers, galleryRows] = await Promise.all([
      this.mapProviders([row]),
      db
        .from('provider_gallery_items as pgi')
        .join('media_assets as ma', 'ma.id', 'pgi.media_id')
        .where('pgi.provider_profile_id', providerId)
        .orderBy('pgi.position', 'asc')
        .select('pgi.id', 'pgi.title', 'ma.id as media_id'),
    ])

    const galleryMediaUrls = await getSignedUrlsByMediaIds(
      galleryRows.map((galleryRow) => Number(galleryRow.media_id))
    )

    const provider = providers[0]
    return response.ok(
      dataResponse({
        ...provider,
        gallery: galleryRows.map((galleryRow) => ({
          id: Number(galleryRow.id),
          imageUrl: galleryMediaUrls.get(Number(galleryRow.media_id)) ?? null,
          title: galleryRow.title ?? null,
        })),
      })
    )
  }

  async reviews({ params, request, response }: HttpContext) {
    const providerId = Number(params.providerId)
    if (!Number.isFinite(providerId) || providerId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'providerId invalide',
        })
      )
    }

    const providerExists = await db
      .from('provider_profiles')
      .where('id', providerId)
      .select('id')
      .first()
    if (!providerExists) {
      return response.notFound(
        errorResponse({
          code: 'PROVIDER_NOT_FOUND',
          message: 'Prestataire introuvable',
        })
      )
    }

    const qs = request.qs()
    const page = parsePositiveInt(qs.page, 1, { min: 1, max: 100_000 })
    const limit = parsePositiveInt(qs.limit, 20, { min: 1, max: 100 })
    const rating = qs.rating ? Number(qs.rating) : null
    const sortOrder = String(qs.sortOrder ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc'

    const countQuery = db.from('provider_reviews as pr').where('pr.provider_profile_id', providerId)
    if (rating && rating >= 1 && rating <= 5) {
      countQuery.where('pr.rating', rating)
    }
    const totalResult = await countQuery.count('* as total').first()
    const total = Number(totalResult?.total ?? 0)

    const rows = await db
      .from('provider_reviews as pr')
      .leftJoin('user_profiles as up', 'up.user_id', 'pr.author_user_id')
      .where('pr.provider_profile_id', providerId)
      .if(rating && rating >= 1 && rating <= 5, (queryBuilder) => {
        queryBuilder.where('pr.rating', rating!)
      })
      .orderBy('pr.created_at', sortOrder)
      .offset((page - 1) * limit)
      .limit(limit)
      .select('pr.id', 'pr.rating', 'pr.comment', 'pr.created_at', 'up.first_name', 'up.last_name')

    const data = rows.map((row) => ({
      id: Number(row.id),
      providerId,
      author: toAuthorName({
        first_name: row.first_name ?? null,
        last_name: row.last_name ?? null,
      }),
      rating: Number(row.rating),
      comment: row.comment ?? null,
      createdAt: toIso(row.created_at),
    }))

    return response.ok(dataResponse(data, { meta: { page, limit, total } }))
  }

  async availability({ params, request, response }: HttpContext) {
    await expireExpiredBookingDrafts()
    const providerId = Number(params.providerId)
    const from = request.input('from')
    const to = request.input('to')

    if (!Number.isFinite(providerId) || providerId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'providerId invalide',
        })
      )
    }

    const fromDate = DateTime.fromISO(String(from), { zone: 'utc' })
    const toDate = DateTime.fromISO(String(to), { zone: 'utc' })
    if (!fromDate.isValid || !toDate.isValid || fromDate >= toDate) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'Paramètres from/to invalides',
        })
      )
    }

    const slots = await db
      .from('provider_availability_slots')
      .where('provider_profile_id', providerId)
      .where('is_booked', false)
      .where('slot_start_at', '>=', fromDate.toJSDate())
      .where('slot_start_at', '<=', toDate.toJSDate())
      .orderBy('slot_start_at', 'asc')
      .select('slot_start_at')

    return response.ok(
      dataResponse({
        slots: slots.map((slot) => toIso(slot.slot_start_at)).filter(Boolean),
      })
    )
  }
}
