import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_shortcuts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('user_id').unsigned().notNullable().unique()
      table.jsonb('recent_provider_ids').notNullable().defaultTo('[]')
      table.jsonb('last_search').nullable()
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('user_id', 'fk_user_shortcuts_user')
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
