export class DuplicateResourceError extends Error {
  constructor() {
    super('Impossible')
    this.name = 'DuplicateResourceError'
  }
}
