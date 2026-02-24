import type { PreRegisterUserDto } from '#application/dto/pre_register_user_dto'
import { toPreRegisterUserWriteModel } from '#application/mappers/pre_register_user_mapper'
import type { PreRegistration } from '#domain/entities/pre_registration'
import type { PasswordHasher } from '#domain/ports/password_hasher'
import type { PreRegistrationRepository } from '#domain/ports/pre_registration_repository'

export interface PreRegisterUserResult {
  status: 'ok'
  message: 'Pre-registration created'
}

export class PreRegisterUserUseCase {
  constructor(
    private readonly repository: PreRegistrationRepository,
    private readonly passwordHasher: PasswordHasher
  ) {}

  async execute(input: PreRegisterUserDto): Promise<PreRegisterUserResult> {
    const data = toPreRegisterUserWriteModel(input)
    const passwordHash = await this.passwordHasher.make(data.password)

    const payload: PreRegistration = {
      roleId: data.roleId,
      email: data.email,
      passwordHash,
      phone: data.phone,
      status: 'pending',
      username: data.username,
      city: data.city,
      zipcode: data.zipcode,
      interest: data.interest,
      comment: data.comment,
    }

    await this.repository.save(payload)
    return { status: 'ok', message: 'Pre-registration created' }
  }
}
