import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('provider_profiles', (table) => {
      table.jsonb('home_service_zones').notNullable().defaultTo('[]')
    })
  }

  async down() {
    this.schema.alterTable('provider_profiles', (table) => {
      table.dropColumn('home_service_zones')
    })
  }
}
