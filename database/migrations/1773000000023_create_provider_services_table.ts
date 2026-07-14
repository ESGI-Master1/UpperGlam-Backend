import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'provider_services'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('provider_profile_id').unsigned().notNullable()
      table.string('name', 150).notNullable()
      table.integer('duration_minutes').notNullable()
      table.bigInteger('price_cents').notNullable()
      table.string('category', 120).notNullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('provider_profile_id', 'fk_provider_services_profile')
        .references('id')
        .inTable('provider_profiles')
        .onDelete('CASCADE')
      table.index(['provider_profile_id', 'is_active'], 'idx_provider_services_profile_active')
      table.unique(['provider_profile_id', 'name'], {
        indexName: 'uq_provider_services_profile_name',
      })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
