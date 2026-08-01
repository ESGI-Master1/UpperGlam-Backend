import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'provider_customer_notes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('provider_profile_id').unsigned().notNullable()
      table.bigInteger('customer_user_id').unsigned().notNullable()
      table.text('note').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('provider_profile_id', 'fk_provider_customer_notes_profile')
        .references('id')
        .inTable('provider_profiles')
        .onDelete('CASCADE')
      table
        .foreign('customer_user_id', 'fk_provider_customer_notes_customer')
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.unique(['provider_profile_id', 'customer_user_id'], {
        indexName: 'uq_provider_customer_notes_profile_customer',
      })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
