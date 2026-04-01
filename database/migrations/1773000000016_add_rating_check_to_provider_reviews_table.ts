import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'provider_reviews'

  async up() {
    this.schema.raw(
      'ALTER TABLE provider_reviews ADD CONSTRAINT ck_provider_reviews_rating_range CHECK (rating BETWEEN 1 AND 5)'
    )
  }

  async down() {
    this.schema.raw(
      'ALTER TABLE provider_reviews DROP CONSTRAINT IF EXISTS ck_provider_reviews_rating_range'
    )
  }
}
