import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('provider_availability_rules', (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('provider_profile_id').unsigned().notNullable()
      table.integer('weekday').notNullable()
      table.string('start_time', 5).notNullable()
      table.string('end_time', 5).notNullable()
      table.string('appointment_mode', 30).nullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('provider_profile_id', 'fk_provider_availability_rules_profile')
        .references('id')
        .inTable('provider_profiles')
        .onDelete('CASCADE')
      table.unique(
        ['provider_profile_id', 'weekday', 'start_time', 'end_time', 'appointment_mode'],
        {
          indexName: 'uq_provider_availability_rules_window',
        }
      )
      table.index(
        ['provider_profile_id', 'weekday', 'is_active'],
        'idx_provider_availability_rules_profile_day'
      )
    })

    this.schema.createTable('provider_availability_closures', (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('provider_profile_id').unsigned().notNullable()
      table.timestamp('starts_at', { useTz: true }).notNullable()
      table.timestamp('ends_at', { useTz: true }).notNullable()
      table.string('reason', 500).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('provider_profile_id', 'fk_provider_availability_closures_profile')
        .references('id')
        .inTable('provider_profiles')
        .onDelete('CASCADE')
      table.index(
        ['provider_profile_id', 'starts_at'],
        'idx_provider_availability_closures_profile_start'
      )
    })
  }

  async down() {
    this.schema.dropTable('provider_availability_closures')
    this.schema.dropTable('provider_availability_rules')
  }
}
