import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'provider_review_media'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('provider_review_id').unsigned().notNullable()
      table.bigInteger('media_id').unsigned().notNullable()
      table.integer('position').notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('provider_review_id', 'fk_provider_review_media_review')
        .references('id')
        .inTable('provider_reviews')
        .onDelete('CASCADE')
      table
        .foreign('media_id', 'fk_provider_review_media_media')
        .references('id')
        .inTable('media_assets')
        .onDelete('CASCADE')
      table.unique(['provider_review_id', 'media_id'], {
        indexName: 'uq_provider_review_media_review_media',
      })
      table.index(['provider_review_id', 'position'], 'idx_provider_review_media_review_position')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
