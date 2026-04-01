import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'provider_profiles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('user_id').unsigned().notNullable().unique()
      table.string('display_name', 150).notNullable()
      table.string('city', 150).notNullable()
      table.text('bio').nullable()
      table.text('institute_address').nullable()
      table.jsonb('service_modes').notNullable().defaultTo('[]')
      table.bigInteger('price_from_cents').nullable()
      table.string('currency', 3).notNullable().defaultTo('EUR')
      table.boolean('is_featured').notNullable().defaultTo(false)
      table.decimal('rating_avg', 3, 2).notNullable().defaultTo(0)
      table.integer('rating_count').notNullable().defaultTo(0)
      table.bigInteger('cover_media_id').unsigned().nullable()
      table.bigInteger('avatar_media_id').unsigned().nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('user_id', 'fk_provider_profiles_user')
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .foreign('cover_media_id', 'fk_provider_profiles_cover_media')
        .references('id')
        .inTable('media_assets')
        .onDelete('SET NULL')
      table
        .foreign('avatar_media_id', 'fk_provider_profiles_avatar_media')
        .references('id')
        .inTable('media_assets')
        .onDelete('SET NULL')
      table.index(['city'], 'idx_provider_profiles_city')
      table.index(['is_featured'], 'idx_provider_profiles_is_featured')
      table.index(['rating_avg'], 'idx_provider_profiles_rating_avg')
      table.index(['price_from_cents'], 'idx_provider_profiles_price')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
