import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'provider_profile_tags'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigInteger('provider_profile_id').unsigned().notNullable()
      table.bigInteger('provider_tag_id').unsigned().notNullable()
      table.primary(['provider_profile_id', 'provider_tag_id'])
      table
        .foreign('provider_profile_id', 'fk_provider_profile_tags_profile')
        .references('id')
        .inTable('provider_profiles')
        .onDelete('CASCADE')
      table
        .foreign('provider_tag_id', 'fk_provider_profile_tags_tag')
        .references('id')
        .inTable('provider_tags')
        .onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
