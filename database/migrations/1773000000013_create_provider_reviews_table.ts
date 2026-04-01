import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'provider_reviews'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('provider_profile_id').unsigned().notNullable()
      table.bigInteger('author_user_id').unsigned().notNullable()
      table.bigInteger('booking_id').unsigned().nullable()
      table.integer('rating').notNullable()
      table.text('comment').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('provider_profile_id', 'fk_provider_reviews_profile')
        .references('id')
        .inTable('provider_profiles')
        .onDelete('CASCADE')
      table
        .foreign('author_user_id', 'fk_provider_reviews_author')
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .foreign('booking_id', 'fk_provider_reviews_booking')
        .references('id')
        .inTable('bookings')
      table.index(['provider_profile_id', 'created_at'], 'idx_provider_reviews_profile_created')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
