export class RoleNotFoundError extends Error {
  constructor() {
    super('Role introuvable')
    this.name = 'RoleNotFoundError'
  }
}
