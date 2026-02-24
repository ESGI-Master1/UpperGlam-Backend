export interface RoleRepository {
  findIdByName(name: string): Promise<number | null>
}
