export class DuplicateResourceError extends Error {
  constructor() {
    super('Un compte existe déjà avec cet email')
    this.name = 'DuplicateResourceError'
  }
}
