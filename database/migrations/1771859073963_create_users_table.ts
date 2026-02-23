import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.string('email', 255).notNullable().unique()
      table.text('password_hash').notNullable()
      table.string('phone', 30).nullable().unique()
      table
        .enu('status', ['pending', 'active', 'suspended'], {
          useNative: true,
          enumName: 'user_status',
          existingType: false,
        })
        .notNullable()
        .defaultTo('pending')
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.index(['status'], 'idx_users_status')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
