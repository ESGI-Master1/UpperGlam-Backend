import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'admin_audit_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('admin_user_id').unsigned().nullable()
      table.bigInteger('pre_registration_id').unsigned().nullable()
      table.string('action', 120).notNullable()
      table.jsonb('details').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('admin_user_id', 'fk_admin_audit_events_admin_user')
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table
        .foreign('pre_registration_id', 'fk_admin_audit_events_pre_registration')
        .references('id')
        .inTable('pre_registrations')
        .onDelete('SET NULL')

      table.index(['admin_user_id'], 'idx_admin_audit_events_admin_user')
      table.index(['pre_registration_id'], 'idx_admin_audit_events_pre_registration')
      table.index(['action'], 'idx_admin_audit_events_action')
      table.index(['created_at'], 'idx_admin_audit_events_created_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
