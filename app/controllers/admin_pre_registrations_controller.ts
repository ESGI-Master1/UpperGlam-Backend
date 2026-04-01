import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { ResendMailSender } from '#infrastructure/integrations/mail/resend_mail_sender'
import { getPreRegistrationApprovedTemplate } from '#infrastructure/integrations/mail/templates/pre_registration_approved'
import { ApiHttpError, dataResponse, errorResponse, parsePositiveInt } from '#services/http'
import { rejectPreRegistrationValidator } from '#validators/admin_pre_registrations'

type PreRegistrationRow = {
  id: number
  user_id: number
  email: string
  phone: string | null
  role: string
  account_status: 'pending' | 'active' | 'suspended'
  first_name: string | null
  last_name: string | null
  username: string
  city: string
  zipcode: string
  marketing_opt_in: boolean
  source: string | null
  desired_services: unknown
  preferred_service_modes: unknown
  preferred_budget_cents: string | number | null
  professional_display_name: string | null
  business_name: string | null
  provider_service_modes: unknown
  provider_institute_address: string | null
  provider_specialties: unknown
  provider_price_from_cents: string | number | null
  provider_years_experience: number | null
  provider_has_certification: boolean
  provider_instagram_url: string | null
  provider_tiktok_url: string | null
  interest: string | null
  comment: string | null
  review_status: 'submitted' | 'in_review' | 'approved' | 'rejected'
  reviewed_at: Date | string | null
  reviewed_by_user_id: number | null
  reviewed_by_email: string | null
  rejection_reason: string | null
  created_at: Date | string
  updated_at: Date | string
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

function toStringArray(value: unknown): string[] {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean)
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry)).filter(Boolean)
      }
    } catch {
      return []
    }
  }

  return []
}

function toPreRegistrationDto(row: PreRegistrationRow) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    role: row.role,
    accountStatus: row.account_status,
    applicant: {
      email: row.email,
      phone: row.phone,
      firstName: row.first_name,
      lastName: row.last_name,
      username: row.username,
      city: row.city,
      zipcode: row.zipcode,
    },
    marketing: {
      optIn: Boolean(row.marketing_opt_in),
      source: row.source,
      interest: row.interest,
      comment: row.comment,
    },
    preferences: {
      desiredServices: toStringArray(row.desired_services),
      preferredServiceModes: toStringArray(row.preferred_service_modes),
      preferredBudgetCents:
        row.preferred_budget_cents === null ? null : Number(row.preferred_budget_cents),
    },
    providerProfile:
      row.role === 'provider'
        ? {
            displayName: row.professional_display_name,
            businessName: row.business_name,
            serviceModes: toStringArray(row.provider_service_modes),
            instituteAddress: row.provider_institute_address,
            specialties: toStringArray(row.provider_specialties),
            priceFromCents:
              row.provider_price_from_cents === null ? null : Number(row.provider_price_from_cents),
            yearsExperience: row.provider_years_experience,
            hasCertification: Boolean(row.provider_has_certification),
            instagramUrl: row.provider_instagram_url,
            tiktokUrl: row.provider_tiktok_url,
          }
        : null,
    review: {
      status: row.review_status,
      reviewedAt: toIso(row.reviewed_at),
      reviewedByUserId: row.reviewed_by_user_id ? Number(row.reviewed_by_user_id) : null,
      reviewedByEmail: row.reviewed_by_email,
      rejectionReason: row.rejection_reason,
    },
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

export default class AdminPreRegistrationsController {
  private readonly mailSender = new ResendMailSender()

  private preRegistrationsQuery() {
    return db
      .from('pre_registrations as pr')
      .join('users as u', 'u.id', 'pr.user_id')
      .join('user_roles as ur', 'ur.user_id', 'u.id')
      .join('roles as r', 'r.id', 'ur.role_id')
      .leftJoin('users as reviewer', 'reviewer.id', 'pr.reviewed_by_user_id')
      .whereIn('r.name', ['user', 'provider'])
  }

  private applyFilters(
    query: ReturnType<AdminPreRegistrationsController['preRegistrationsQuery']>,
    filters: {
      role?: string
      reviewStatus?: string
      accountStatus?: string
      search?: string
    }
  ) {
    if (filters.role) {
      query.where('r.name', filters.role)
    }
    if (filters.reviewStatus) {
      query.where('pr.review_status', filters.reviewStatus)
    }
    if (filters.accountStatus) {
      query.where('u.status', filters.accountStatus)
    }
    if (filters.search) {
      query.where((builder) => {
        builder
          .whereILike('u.email', `%${filters.search}%`)
          .orWhereILike('pr.first_name', `%${filters.search}%`)
          .orWhereILike('pr.last_name', `%${filters.search}%`)
          .orWhereILike('pr.username', `%${filters.search}%`)
          .orWhereILike('pr.city', `%${filters.search}%`)
      })
    }
  }

  private async getPreRegistrationById(preRegistrationId: number) {
    return (await this.preRegistrationsQuery()
      .where('pr.id', preRegistrationId)
      .select(
        'pr.id',
        'pr.user_id',
        'u.email',
        'u.phone',
        'r.name as role',
        'u.status as account_status',
        'pr.first_name',
        'pr.last_name',
        'pr.username',
        'pr.city',
        'pr.zipcode',
        'pr.marketing_opt_in',
        'pr.source',
        'pr.desired_services',
        'pr.preferred_service_modes',
        'pr.preferred_budget_cents',
        'pr.professional_display_name',
        'pr.business_name',
        'pr.provider_service_modes',
        'pr.provider_institute_address',
        'pr.provider_specialties',
        'pr.provider_price_from_cents',
        'pr.provider_years_experience',
        'pr.provider_has_certification',
        'pr.provider_instagram_url',
        'pr.provider_tiktok_url',
        'pr.interest',
        'pr.comment',
        'pr.review_status',
        'pr.reviewed_at',
        'pr.reviewed_by_user_id',
        'reviewer.email as reviewed_by_email',
        'pr.rejection_reason',
        'pr.created_at',
        'pr.updated_at'
      )
      .first()) as PreRegistrationRow | null
  }

  async index({ request, response }: HttpContext) {
    const qs = request.qs()
    const page = parsePositiveInt(qs.page, 1, { min: 1, max: 100_000 })
    const limit = parsePositiveInt(qs.limit, 20, { min: 1, max: 100 })

    const filters = {
      role: qs.role ? String(qs.role) : undefined,
      reviewStatus: qs.reviewStatus ? String(qs.reviewStatus) : undefined,
      accountStatus: qs.accountStatus ? String(qs.accountStatus) : undefined,
      search: qs.search ? String(qs.search).trim() : undefined,
    }

    const countQuery = this.preRegistrationsQuery()
    this.applyFilters(countQuery, filters)
    const totalResult = await countQuery.countDistinct('pr.id as total').first()
    const total = Number(totalResult?.total ?? 0)

    const rowsQuery = this.preRegistrationsQuery()
    this.applyFilters(rowsQuery, filters)

    const rows = (await rowsQuery
      .select(
        'pr.id',
        'pr.user_id',
        'u.email',
        'u.phone',
        'r.name as role',
        'u.status as account_status',
        'pr.first_name',
        'pr.last_name',
        'pr.username',
        'pr.city',
        'pr.zipcode',
        'pr.marketing_opt_in',
        'pr.source',
        'pr.desired_services',
        'pr.preferred_service_modes',
        'pr.preferred_budget_cents',
        'pr.professional_display_name',
        'pr.business_name',
        'pr.provider_service_modes',
        'pr.provider_institute_address',
        'pr.provider_specialties',
        'pr.provider_price_from_cents',
        'pr.provider_years_experience',
        'pr.provider_has_certification',
        'pr.provider_instagram_url',
        'pr.provider_tiktok_url',
        'pr.interest',
        'pr.comment',
        'pr.review_status',
        'pr.reviewed_at',
        'pr.reviewed_by_user_id',
        'reviewer.email as reviewed_by_email',
        'pr.rejection_reason',
        'pr.created_at',
        'pr.updated_at'
      )
      .orderBy('pr.created_at', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)) as PreRegistrationRow[]

    return response.ok(
      dataResponse(
        rows.map((row) => toPreRegistrationDto(row)),
        { meta: { page, limit, total } }
      )
    )
  }

  async show({ params, response }: HttpContext) {
    const preRegistrationId = Number(params.preRegistrationId)
    if (!Number.isFinite(preRegistrationId) || preRegistrationId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'preRegistrationId invalide',
        })
      )
    }

    const row = await this.getPreRegistrationById(preRegistrationId)
    if (!row) {
      return response.notFound(
        errorResponse({
          code: 'PRE_REGISTRATION_NOT_FOUND',
          message: 'Pré-inscription introuvable.',
        })
      )
    }

    return response.ok(dataResponse(toPreRegistrationDto(row)))
  }

  async approve({ auth, params, response, logger }: HttpContext) {
    const preRegistrationId = Number(params.preRegistrationId)
    if (!Number.isFinite(preRegistrationId) || preRegistrationId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'preRegistrationId invalide',
        })
      )
    }

    const adminUser = auth.getUserOrFail()

    let recipientEmail: string | null = null
    let recipientFirstName = 'Bonjour'
    try {
      await db.transaction(async (trx) => {
        const current = await trx
          .from('pre_registrations as pr')
          .join('users as u', 'u.id', 'pr.user_id')
          .where('pr.id', preRegistrationId)
          .forUpdate()
          .select(
            'pr.id',
            'pr.user_id',
            'pr.review_status',
            'u.email',
            'pr.first_name',
            'pr.username'
          )
          .first()

        if (!current) {
          throw new ApiHttpError(404, {
            code: 'PRE_REGISTRATION_NOT_FOUND',
            message: 'Pré-inscription introuvable.',
          })
        }

        if (current.review_status === 'approved') {
          throw new ApiHttpError(409, {
            code: 'PRE_REGISTRATION_ALREADY_APPROVED',
            message: 'Cette pré-inscription est déjà approuvée.',
          })
        }

        await trx.from('pre_registrations').where('id', preRegistrationId).update({
          review_status: 'approved',
          reviewed_at: DateTime.utc().toJSDate(),
          reviewed_by_user_id: adminUser.id,
          rejection_reason: null,
          updated_at: DateTime.utc().toJSDate(),
        })

        await trx.from('users').where('id', Number(current.user_id)).update({
          status: 'active',
        })

        recipientEmail = String(current.email)
        recipientFirstName = String(current.first_name ?? current.username ?? 'Bonjour')
      })
    } catch (error) {
      if (error instanceof ApiHttpError) {
        return response.status(error.status).send(errorResponse(error.payload))
      }
      throw error
    }

    const row = await this.getPreRegistrationById(preRegistrationId)
    if (!row) {
      return response.notFound(
        errorResponse({
          code: 'PRE_REGISTRATION_NOT_FOUND',
          message: 'Pré-inscription introuvable.',
        })
      )
    }

    let mailSent = false
    if (recipientEmail) {
      try {
        await this.mailSender.send({
          to: recipientEmail,
          subject: 'Votre pré-inscription Upper Glam est validée',
          body: getPreRegistrationApprovedTemplate(recipientFirstName),
        })
        mailSent = true
      } catch (error) {
        logger.error(
          { error, preRegistrationId, email: recipientEmail },
          'Failed to send pre-registration approval email'
        )
      }
    }

    return response.ok(
      dataResponse(
        {
          ...toPreRegistrationDto(row),
          mailSent,
        },
        { message: 'Pré-inscription approuvée.' }
      )
    )
  }

  async reject({ auth, params, request, response }: HttpContext) {
    const preRegistrationId = Number(params.preRegistrationId)
    if (!Number.isFinite(preRegistrationId) || preRegistrationId <= 0) {
      return response.badRequest(
        errorResponse({
          code: 'VALIDATION_ERROR',
          message: 'preRegistrationId invalide',
        })
      )
    }

    const adminUser = auth.getUserOrFail()
    const payload = await request.validateUsing(rejectPreRegistrationValidator)

    try {
      await db.transaction(async (trx) => {
        const current = await trx
          .from('pre_registrations')
          .where('id', preRegistrationId)
          .forUpdate()
          .select('id', 'user_id', 'review_status')
          .first()

        if (!current) {
          throw new ApiHttpError(404, {
            code: 'PRE_REGISTRATION_NOT_FOUND',
            message: 'Pré-inscription introuvable.',
          })
        }

        if (current.review_status === 'rejected') {
          throw new ApiHttpError(409, {
            code: 'PRE_REGISTRATION_ALREADY_REJECTED',
            message: 'Cette pré-inscription est déjà refusée.',
          })
        }

        await trx.from('pre_registrations').where('id', preRegistrationId).update({
          review_status: 'rejected',
          reviewed_at: DateTime.utc().toJSDate(),
          reviewed_by_user_id: adminUser.id,
          rejection_reason: payload.reason,
          updated_at: DateTime.utc().toJSDate(),
        })

        await trx.from('users').where('id', Number(current.user_id)).update({
          status: 'suspended',
        })
      })
    } catch (error) {
      if (error instanceof ApiHttpError) {
        return response.status(error.status).send(errorResponse(error.payload))
      }
      throw error
    }

    const row = await this.getPreRegistrationById(preRegistrationId)
    if (!row) {
      return response.notFound(
        errorResponse({
          code: 'PRE_REGISTRATION_NOT_FOUND',
          message: 'Pré-inscription introuvable.',
        })
      )
    }

    return response.ok(
      dataResponse(toPreRegistrationDto(row), { message: 'Pré-inscription refusée.' })
    )
  }
}
