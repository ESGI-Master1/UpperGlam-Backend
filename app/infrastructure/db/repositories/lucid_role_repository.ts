import db from '@adonisjs/lucid/services/db'
import type { RoleRepository } from '#domain/ports/role_repository'

export class LucidRoleRepository implements RoleRepository {
  async findIdByName(name: string): Promise<number | null> {
    const role = await db.from('roles').select('id').where('name', name).first()
    return role?.id ? Number(role.id) : null
  }
}
