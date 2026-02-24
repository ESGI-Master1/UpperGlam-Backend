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

const repository = new LucidPreRegistrationRepository()
const roleRepository = new LucidRoleRepository()
const passwordHasher = new AdonisPasswordHasher()
const resolveRoleIdUseCase = new ResolveRoleIdUseCase(roleRepository)
const preRegisterUserUseCase = new PreRegisterUserUseCase(repository, passwordHasher)

export default class PreRegistrationsController {
  async store({ request, response }: HttpContext) {
    const payload = await request.validateUsing(preRegistrationRequestValidator)

    try {
      const roleId = await resolveRoleIdUseCase.execute({ role: payload.role })
      const result = await preRegisterUserUseCase.execute({
        roleId,
        email: payload.email,
        password: payload.password,
        phone: payload.phone,
        username: payload.username,
        city: payload.city,
        zipcode: payload.zipcode,
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
