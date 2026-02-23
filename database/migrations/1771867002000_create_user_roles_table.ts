import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_roles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigInteger('user_id').unsigned().notNullable()
      table.bigInteger('role_id').unsigned().notNullable()

      table.primary(['user_id', 'role_id'])

      table
        .foreign('user_id', 'fk_user_roles_user')
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      table
        .foreign('role_id', 'fk_user_roles_role')
        .references('id')
        .inTable('roles')
        .onDelete('CASCADE')

      table.index(['user_id'], 'idx_user_roles_user')
      table.index(['role_id'], 'idx_user_roles_role')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
