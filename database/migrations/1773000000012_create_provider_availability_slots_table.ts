import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'provider_availability_slots'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('provider_profile_id').unsigned().notNullable()
      table.timestamp('slot_start_at', { useTz: true }).notNullable()
      table.timestamp('slot_end_at', { useTz: true }).notNullable()
      table.boolean('is_booked').notNullable().defaultTo(false)
      table.bigInteger('booking_id').unsigned().nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('provider_profile_id', 'fk_provider_slots_profile')
        .references('id')
        .inTable('provider_profiles')
        .onDelete('CASCADE')
      table.foreign('booking_id', 'fk_provider_slots_booking').references('id').inTable('bookings')
      table.unique(['provider_profile_id', 'slot_start_at'], {
        indexName: 'uq_provider_slots_profile_start',
      })
      table.index(['provider_profile_id', 'slot_start_at'], 'idx_provider_slots_profile_start')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
