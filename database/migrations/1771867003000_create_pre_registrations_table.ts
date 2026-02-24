import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pre_registrations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('user_id').unsigned().notNullable().unique()
      table.string('username', 100).notNullable()
      table.string('city', 120).notNullable()
      table.string('zipcode', 20).notNullable()
      table.text('interest').nullable()
      table.text('comment').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('user_id', 'fk_pre_registration_user')
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      table.index(['city'], 'idx_pre_registrations_city')
      table.index(['zipcode'], 'idx_pre_registrations_zipcode')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
