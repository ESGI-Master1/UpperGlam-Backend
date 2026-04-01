import type { HttpContext } from '@adonisjs/core/http'
import { PreRegisterUserUseCase } from '#application/useCases/pre_register_user_use_case'
import { DuplicateResourceError } from '#domain/errors/duplicate_resource_error'
import { ResolveRoleIdUseCase } from '#application/useCases/resolve_role_id_use_case'
import { RoleNotFoundError } from '#domain/errors/role_not_found_error'
import { LucidPreRegistrationRepository } from '#infrastructure/db/repositories/lucid_pre_registration_repository'
import { LucidRoleRepository } from '#infrastructure/db/repositories/lucid_role_repository'
import { preRegistrationRequestValidator } from '#infrastructure/http/requests/pre_registration_request'
import { presentPreRegistrationResult } from '#infrastructure/http/presenters/pre_registration_presenter'
import { AdonisPasswordHasher } from '#infrastructure/integrations/security/adonis_password_hasher'
import { ResendMailSender } from '#infrastructure/integrations/mail/resend_mail_sender'

const repository = new LucidPreRegistrationRepository()
const roleRepository = new LucidRoleRepository()
const passwordHasher = new AdonisPasswordHasher()
const mailSender = new ResendMailSender()
const resolveRoleIdUseCase = new ResolveRoleIdUseCase(roleRepository)
const preRegisterUserUseCase = new PreRegisterUserUseCase(repository, passwordHasher, mailSender)

function containsProviderPayload(payload: {
  providerProfile?: {
    displayName?: string
    businessName?: string
    instituteAddress?: string
    serviceModes?: string[]
    specialties?: string[]
    priceFromCents?: number
    yearsExperience?: number
    hasCertification?: boolean
    instagramUrl?: string
    tiktokUrl?: string
  }
}) {
  return Boolean(
    payload.providerProfile &&
    (payload.providerProfile.displayName ||
      payload.providerProfile.businessName ||
      payload.providerProfile.instituteAddress ||
      payload.providerProfile.serviceModes?.length ||
      payload.providerProfile.specialties?.length ||
      payload.providerProfile.priceFromCents ||
      payload.providerProfile.yearsExperience ||
      payload.providerProfile.hasCertification ||
      payload.providerProfile.instagramUrl ||
      payload.providerProfile.tiktokUrl)
  )
}

export default class PreRegistrationsController {
  async store({ request, response }: HttpContext) {
    const payload = await request.validateUsing(preRegistrationRequestValidator)

    if (payload.role === 'provider') {
      if (!payload.providerProfile?.displayName) {
        return response.unprocessableEntity({
          error: 'VALIDATION_ERROR',
          message: 'displayName est obligatoire pour un prestataire.',
        })
      }
    }

    if (payload.role === 'user' && containsProviderPayload(payload)) {
      return response.unprocessableEntity({
        error: 'VALIDATION_ERROR',
        message: 'providerProfile ne peut être envoyé que pour le role provider.',
      })
    }

    try {
      const roleId = await resolveRoleIdUseCase.execute({ role: payload.role })
      const result = await preRegisterUserUseCase.execute({
        role: payload.role,
        roleId,
        email: payload.email,
        password: payload.password,
        phone: payload.phone,
        firstName: payload.firstName,
        lastName: payload.lastName,
        username: payload.username,
        city: payload.city,
        zipcode: payload.zipcode,
        marketingOptIn: payload.marketingOptIn,
        source: payload.source,
        desiredServices: payload.desiredServices,
        preferredServiceModes: payload.preferredServiceModes,
        preferredBudgetCents: payload.preferredBudgetCents,
        providerProfile: payload.providerProfile,
        interest: payload.interest,
        comment: payload.comment,
      })

      return response.created(presentPreRegistrationResult(result))
    } catch (error) {
      if (error instanceof RoleNotFoundError) {
        return response.unprocessableEntity({
          error: 'INVALID_ROLE',
          message: "Le role doit etre 'user' ou 'provider'",
        })
      }

      if (error instanceof DuplicateResourceError) {
        console.warn('[PRE_REGISTRATION_DUPLICATE_EMAIL]', {
          email: payload.email.toLowerCase(),
          role: payload.role,
        })

        return response.conflict({
          error: 'PRE_REGISTRATION_ERROR',
        })
      }

      throw error
    }
  }
}
