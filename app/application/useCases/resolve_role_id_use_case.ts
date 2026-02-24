import type { ResolveRoleIdDto } from '#application/dto/resolve_role_id_dto'
import { RoleNotFoundError } from '#domain/errors/role_not_found_error'
import type { RoleRepository } from '#domain/ports/role_repository'

export class ResolveRoleIdUseCase {
  constructor(private readonly roleRepository: RoleRepository) {}

  async execute(input: ResolveRoleIdDto): Promise<number> {
    const roleId = await this.roleRepository.findIdByName(input.role)

    if (!roleId) {
      throw new RoleNotFoundError()
    }

    return roleId
  }
}
