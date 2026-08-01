import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bookings'

  async up() {
    this.schema.raw(`
      DO $$ BEGIN
        CREATE TYPE booking_provider_status AS ENUM ('pending', 'accepted', 'rejected', 'slot_proposed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `)

    this.schema.alterTable(this.tableName, (table) => {
      table
        .enu('provider_status', ['pending', 'accepted', 'rejected', 'slot_proposed'], {
          useNative: true,
          enumName: 'booking_provider_status',
          existingType: true,
        })
        .notNullable()
        .defaultTo('pending')
      table.text('provider_response_note').nullable()
      table.timestamp('provider_proposed_slot_start_at', { useTz: true }).nullable()
      table.timestamp('provider_proposed_slot_end_at', { useTz: true }).nullable()
      table.timestamp('provider_responded_at', { useTz: true }).nullable()

      table.index(['provider_profile_id', 'provider_status'], 'idx_bookings_provider_status')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['provider_profile_id', 'provider_status'], 'idx_bookings_provider_status')
      table.dropColumn('provider_status')
      table.dropColumn('provider_response_note')
      table.dropColumn('provider_proposed_slot_start_at')
      table.dropColumn('provider_proposed_slot_end_at')
      table.dropColumn('provider_responded_at')
    })

    this.schema.raw('DROP TYPE IF EXISTS booking_provider_status')
  }
}
