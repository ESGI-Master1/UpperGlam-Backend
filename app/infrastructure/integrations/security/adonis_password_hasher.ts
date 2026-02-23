import hash from '@adonisjs/core/services/hash'
import type { PasswordHasher } from '#domain/ports/password_hasher'

export class AdonisPasswordHasher implements PasswordHasher {
  async make(value: string): Promise<string> {
    return hash.make(value)
  }
}
