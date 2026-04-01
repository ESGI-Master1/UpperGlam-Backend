import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_profiles'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .foreign('avatar_media_id', 'fk_user_profiles_avatar_media')
        .references('id')
        .inTable('media_assets')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['avatar_media_id'], 'fk_user_profiles_avatar_media')
    })
  }
}
