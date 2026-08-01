import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'card';
    `)
  }

  async down() {
    // PostgreSQL does not safely remove a single enum value in place.
  }
}
