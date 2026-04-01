import db from '@adonisjs/lucid/services/db'
import type { PreRegistration } from '#domain/entities/pre_registration'
import { DuplicateResourceError } from '#domain/errors/duplicate_resource_error'
import type { PreRegistrationRepository } from '#domain/ports/pre_registration_repository'

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  return 'code' in error && error.code === '23505'
}

export class LucidPreRegistrationRepository implements PreRegistrationRepository {
  async save(input: PreRegistration): Promise<void> {
    try {
      await db.transaction(async (trx) => {
        const [createdUser] = await trx
          .table('users')
          .insert({
            email: input.email,
            password_hash: input.passwordHash,
            phone: input.phone,
            status: input.status,
          })
          .returning(['id'])

        await trx.table('user_roles').insert({
          user_id: createdUser.id,
          role_id: input.roleId,
        })

        await trx.table('pre_registrations').insert({
          user_id: createdUser.id,
          first_name: input.firstName,
          last_name: input.lastName,
          username: input.username,
          city: input.city,
          zipcode: input.zipcode,
          marketing_opt_in: input.marketingOptIn,
          source: input.source,
          desired_services: input.desiredServices ? JSON.stringify(input.desiredServices) : null,
          preferred_service_modes: input.preferredServiceModes
            ? JSON.stringify(input.preferredServiceModes)
            : null,
          preferred_budget_cents: input.preferredBudgetCents,
          professional_display_name: input.professionalDisplayName,
          business_name: input.businessName,
          provider_service_modes: input.providerServiceModes
            ? JSON.stringify(input.providerServiceModes)
            : null,
          provider_institute_address: input.providerInstituteAddress,
          provider_specialties: input.providerSpecialties
            ? JSON.stringify(input.providerSpecialties)
            : null,
          provider_price_from_cents: input.providerPriceFromCents,
          provider_years_experience: input.providerYearsExperience,
          provider_has_certification: input.providerHasCertification,
          provider_instagram_url: input.providerInstagramUrl,
          provider_tiktok_url: input.providerTiktokUrl,
          review_status: input.reviewStatus,
          reviewed_at: input.reviewedAt,
          reviewed_by_user_id: input.reviewedByUserId,
          rejection_reason: input.rejectionReason,
          interest: input.interest,
          comment: input.comment,
          updated_at: new Date(),
        })
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateResourceError()
      }

      throw error
    }
  }
}
