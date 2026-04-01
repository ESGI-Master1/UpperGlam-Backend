import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'payments'

  async up() {
    this.schema.raw(`
      DO $$ BEGIN
        CREATE TYPE payment_method AS ENUM ('apple_pay', 'google_pay');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `)
    this.schema.raw(`
      DO $$ BEGIN
        CREATE TYPE payment_status AS ENUM ('succeeded', 'failed', 'pending');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `)

    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('booking_draft_id').unsigned().notNullable()
      table.bigInteger('booking_id').unsigned().nullable()
      table
        .enu('method', ['apple_pay', 'google_pay'], {
          useNative: true,
          enumName: 'payment_method',
          existingType: true,
        })
        .notNullable()
      table.string('provider', 60).notNullable()
      table.string('provider_transaction_id', 120).notNullable()
      table.string('provider_reference', 1024).nullable()
      table
        .enu('status', ['succeeded', 'failed'], {
          useNative: true,
          enumName: 'payment_status',
          existingType: true,
        })
        .notNullable()
        .defaultTo('succeeded')
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('booking_draft_id', 'fk_payments_booking_draft')
        .references('id')
        .inTable('booking_drafts')
        .onDelete('CASCADE')
      table.foreign('booking_id', 'fk_payments_booking').references('id').inTable('bookings')
      table.unique(['provider_transaction_id'], {
        indexName: 'uq_payments_provider_transaction_id',
      })
      table.index(['booking_id', 'created_at'], 'idx_payments_booking_created')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
