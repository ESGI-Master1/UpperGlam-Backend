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
          username: input.username,
          city: input.city,
          zipcode: input.zipcode,
          interest: input.interest,
          comment: input.comment,
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
