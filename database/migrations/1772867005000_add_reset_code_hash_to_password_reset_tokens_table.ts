import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'password_reset_tokens'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('reset_code_hash', 64).nullable()
      table.index(['user_id', 'reset_code_hash'], 'idx_password_reset_tokens_user_code')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['user_id', 'reset_code_hash'], 'idx_password_reset_tokens_user_code')
      table.dropColumn('reset_code_hash')
    })
  }
}
