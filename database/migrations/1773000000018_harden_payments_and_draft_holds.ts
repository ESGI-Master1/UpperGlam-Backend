import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'processing';
      ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'refunded';
    `)

    this.schema.alterTable('payments', (table) => {
      table.string('idempotency_key', 160).nullable()
      table.string('checkout_url', 1024).nullable()
      table.string('refund_transaction_id', 120).nullable()
      table.timestamp('refunded_at', { useTz: true }).nullable()
      table.text('failure_reason').nullable()
      table.jsonb('provider_payload').nullable()
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.unique(['idempotency_key'], {
        indexName: 'uq_payments_idempotency_key',
      })
      table.index(['booking_draft_id', 'status'], 'idx_payments_draft_status')
    })

    this.schema.alterTable('provider_availability_slots', (table) => {
      table.bigInteger('booking_draft_id').unsigned().nullable()
      table
        .foreign('booking_draft_id', 'fk_provider_slots_booking_draft')
        .references('id')
        .inTable('booking_drafts')
        .onDelete('SET NULL')
      table.index(['booking_draft_id'], 'idx_provider_slots_booking_draft')
    })
  }

  async down() {
    this.schema.alterTable('provider_availability_slots', (table) => {
      table.dropIndex(['booking_draft_id'], 'idx_provider_slots_booking_draft')
      table.dropForeign(['booking_draft_id'], 'fk_provider_slots_booking_draft')
      table.dropColumn('booking_draft_id')
    })

    this.schema.alterTable('payments', (table) => {
      table.dropIndex(['booking_draft_id', 'status'], 'idx_payments_draft_status')
      table.dropUnique(['idempotency_key'], 'uq_payments_idempotency_key')
      table.dropColumns(
        'idempotency_key',
        'checkout_url',
        'refund_transaction_id',
        'refunded_at',
        'failure_reason',
        'provider_payload',
        'updated_at'
      )
    })
  }
}
