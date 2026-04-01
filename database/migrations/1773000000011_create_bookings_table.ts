import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bookings'

  async up() {
    this.schema.raw(`
      DO $$ BEGIN
        CREATE TYPE booking_appointment_mode AS ENUM ('home', 'institute');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `)
    this.schema.raw(`
      DO $$ BEGIN
        CREATE TYPE booking_status AS ENUM ('paid', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `)

    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('draft_id').unsigned().notNullable().unique()
      table.bigInteger('customer_user_id').unsigned().notNullable()
      table.bigInteger('provider_profile_id').unsigned().notNullable()
      table.timestamp('slot_start_at', { useTz: true }).notNullable()
      table.timestamp('slot_end_at', { useTz: true }).notNullable()
      table
        .enu('appointment_mode', ['home', 'institute'], {
          useNative: true,
          enumName: 'booking_appointment_mode',
          existingType: true,
        })
        .notNullable()
      table.text('address').nullable()
      table.text('note').nullable()
      table.bigInteger('amount_cents').notNullable()
      table.string('currency', 3).notNullable().defaultTo('EUR')
      table
        .enu('status', ['paid', 'cancelled'], {
          useNative: true,
          enumName: 'booking_status',
          existingType: true,
        })
        .notNullable()
        .defaultTo('paid')
      table.string('confirmation_code', 20).notNullable().unique()
      table.timestamp('cancelled_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.foreign('draft_id', 'fk_bookings_draft').references('id').inTable('booking_drafts')
      table
        .foreign('customer_user_id', 'fk_bookings_customer')
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .foreign('provider_profile_id', 'fk_bookings_provider')
        .references('id')
        .inTable('provider_profiles')
        .onDelete('CASCADE')
      table.index(['customer_user_id', 'status'], 'idx_bookings_customer_status')
      table.index(['provider_profile_id', 'slot_start_at'], 'idx_bookings_provider_slot')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
