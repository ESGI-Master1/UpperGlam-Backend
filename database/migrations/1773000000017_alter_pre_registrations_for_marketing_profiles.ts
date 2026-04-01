import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pre_registrations'

  async up() {
    this.schema.raw(`
      DO $$ BEGIN
        CREATE TYPE pre_registration_review_status AS ENUM ('submitted', 'in_review', 'approved', 'rejected');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `)

    this.schema.alterTable(this.tableName, (table) => {
      table.string('first_name', 120).nullable()
      table.string('last_name', 120).nullable()
      table.boolean('marketing_opt_in').notNullable().defaultTo(false)
      table.string('source', 120).nullable()
      table.jsonb('desired_services').nullable()
      table.jsonb('preferred_service_modes').nullable()
      table.bigInteger('preferred_budget_cents').nullable()

      table.string('professional_display_name', 150).nullable()
      table.string('business_name', 150).nullable()
      table.jsonb('provider_service_modes').nullable()
      table.text('provider_institute_address').nullable()
      table.jsonb('provider_specialties').nullable()
      table.bigInteger('provider_price_from_cents').nullable()
      table.integer('provider_years_experience').nullable()
      table.boolean('provider_has_certification').notNullable().defaultTo(false)
      table.string('provider_instagram_url', 255).nullable()
      table.string('provider_tiktok_url', 255).nullable()

      table
        .enu('review_status', ['submitted', 'in_review', 'approved', 'rejected'], {
          useNative: true,
          enumName: 'pre_registration_review_status',
          existingType: true,
        })
        .notNullable()
        .defaultTo('submitted')
      table.timestamp('reviewed_at', { useTz: true }).nullable()
      table.bigInteger('reviewed_by_user_id').unsigned().nullable()
      table.text('rejection_reason').nullable()
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('reviewed_by_user_id', 'fk_pre_registrations_reviewed_by_user')
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.index(['review_status'], 'idx_pre_registrations_review_status')
      table.index(['reviewed_by_user_id'], 'idx_pre_registrations_reviewed_by_user')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['review_status'], 'idx_pre_registrations_review_status')
      table.dropIndex(['reviewed_by_user_id'], 'idx_pre_registrations_reviewed_by_user')
      table.dropForeign(['reviewed_by_user_id'], 'fk_pre_registrations_reviewed_by_user')

      table.dropColumn('first_name')
      table.dropColumn('last_name')
      table.dropColumn('marketing_opt_in')
      table.dropColumn('source')
      table.dropColumn('desired_services')
      table.dropColumn('preferred_service_modes')
      table.dropColumn('preferred_budget_cents')
      table.dropColumn('professional_display_name')
      table.dropColumn('business_name')
      table.dropColumn('provider_service_modes')
      table.dropColumn('provider_institute_address')
      table.dropColumn('provider_specialties')
      table.dropColumn('provider_price_from_cents')
      table.dropColumn('provider_years_experience')
      table.dropColumn('provider_has_certification')
      table.dropColumn('provider_instagram_url')
      table.dropColumn('provider_tiktok_url')
      table.dropColumn('review_status')
      table.dropColumn('reviewed_at')
      table.dropColumn('reviewed_by_user_id')
      table.dropColumn('rejection_reason')
      table.dropColumn('updated_at')
    })

    this.schema.raw('DROP TYPE IF EXISTS pre_registration_review_status')
  }
}
