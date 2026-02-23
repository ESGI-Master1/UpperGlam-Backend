import type { PreRegistration } from '#domain/entities/pre_registration'

export interface PreRegistrationRepository {
  save(input: PreRegistration): Promise<void>
}
