import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'provider_gallery_items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('provider_profile_id').unsigned().notNullable()
      table.bigInteger('media_id').unsigned().notNullable()
      table.string('title', 255).nullable()
      table.integer('position').notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('provider_profile_id', 'fk_provider_gallery_items_profile')
        .references('id')
        .inTable('provider_profiles')
        .onDelete('CASCADE')
      table
        .foreign('media_id', 'fk_provider_gallery_items_media')
        .references('id')
        .inTable('media_assets')
        .onDelete('CASCADE')
      table.index(['provider_profile_id', 'position'], 'idx_provider_gallery_items_order')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
