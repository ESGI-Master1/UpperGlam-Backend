import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'booking_drafts'

  async up() {
    this.schema.raw(`
      DO $$ BEGIN
        CREATE TYPE appointment_mode AS ENUM ('home', 'institute');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `)
    this.schema.raw(`
      DO $$ BEGIN
        CREATE TYPE booking_draft_status AS ENUM ('pending_payment', 'payment_failed', 'expired', 'completed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `)

    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('customer_user_id').unsigned().notNullable()
      table.bigInteger('provider_profile_id').unsigned().notNullable()
      table.timestamp('slot_start_at', { useTz: true }).notNullable()
      table.timestamp('slot_end_at', { useTz: true }).notNullable()
      table
        .enu('appointment_mode', ['home', 'institute'], {
          useNative: true,
          enumName: 'appointment_mode',
          existingType: true,
        })
        .notNullable()
      table.text('address').nullable()
      table.text('note').nullable()
      table.bigInteger('amount_cents').notNullable()
      table.string('currency', 3).notNullable().defaultTo('EUR')
      table
        .enu('status', ['pending_payment', 'payment_failed', 'expired', 'completed'], {
          useNative: true,
          enumName: 'booking_draft_status',
          existingType: true,
        })
        .notNullable()
        .defaultTo('pending_payment')
      table.timestamp('expires_at', { useTz: true }).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('customer_user_id', 'fk_booking_drafts_customer')
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .foreign('provider_profile_id', 'fk_booking_drafts_provider')
        .references('id')
        .inTable('provider_profiles')
        .onDelete('CASCADE')
      table.index(['customer_user_id', 'status'], 'idx_booking_drafts_customer_status')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
