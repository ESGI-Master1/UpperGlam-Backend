import type { HttpContext } from '@adonisjs/core/http'
import { PreRegisterUserUseCase } from '#application/useCases/pre_register_user_use_case'
import { LucidPreRegistrationRepository } from '#infrastructure/db/repositories/lucid_pre_registration_repository'
import { preRegistrationRequestValidator } from '#infrastructure/http/requests/pre_registration_request'
import { presentPreRegistrationResult } from '#infrastructure/http/presenters/pre_registration_presenter'
import { AdonisPasswordHasher } from '#infrastructure/integrations/security/adonis_password_hasher'

const repository = new LucidPreRegistrationRepository()
const passwordHasher = new AdonisPasswordHasher()
const preRegisterUserUseCase = new PreRegisterUserUseCase(repository, passwordHasher)

export default class PreRegistrationsController {
  async store({ request, response }: HttpContext) {
    const payload = await request.validateUsing(preRegistrationRequestValidator)
    const result = await preRegisterUserUseCase.execute(payload)

    return response.ok(presentPreRegistrationResult(result))
  }
}
