import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'media_assets'

  async up() {
    this.schema.raw(`
      DO $$ BEGIN
        CREATE TYPE media_asset_category AS ENUM ('profile', 'review', 'shop', 'other');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `)
    this.schema.raw(`
      DO $$ BEGIN
        CREATE TYPE media_asset_visibility AS ENUM ('private', 'public');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `)

    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('owner_user_id').unsigned().notNullable()
      table.string('bucket', 120).notNullable()
      table.string('object_key', 1024).notNullable().unique()
      table.string('mime_type', 120).notNullable()
      table.bigInteger('size_bytes').notNullable()
      table
        .enu('category', ['profile', 'review', 'shop', 'other'], {
          useNative: true,
          enumName: 'media_asset_category',
          existingType: true,
        })
        .notNullable()
      table
        .enu('visibility', ['private', 'public'], {
          useNative: true,
          enumName: 'media_asset_visibility',
          existingType: true,
        })
        .notNullable()
        .defaultTo('private')
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      table
        .foreign('owner_user_id', 'fk_media_assets_owner_user')
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
