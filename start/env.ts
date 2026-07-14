/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),
  ACCESS_TOKEN_EXPIRES_IN: Env.schema.string.optional(),
  RESEND_API_KEY: Env.schema.string(),
  MAIL_FROM: Env.schema.string(),
  FRONTEND_RESET_PASSWORD_URL: Env.schema.string.optional(),
  PASSWORD_RESET_TOKEN_EXPIRES_MINUTES: Env.schema.number.optional(),
  MINIO_ENDPOINT: Env.schema.string.optional(),
  MINIO_PORT: Env.schema.number.optional(),
  MINIO_USE_SSL: Env.schema.boolean.optional(),
  MINIO_ACCESS_KEY: Env.schema.string.optional(),
  MINIO_SECRET_KEY: Env.schema.string.optional(),
  MINIO_BUCKET_USER_IMAGES: Env.schema.string.optional(),
  MINIO_REGION: Env.schema.string.optional(),
  STRIPE_SECRET_KEY: Env.schema.string.optional(),
})
